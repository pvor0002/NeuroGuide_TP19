"""
ADHD dataset–driven ML layer for job match scoring.

Trains a RandomForestRegressor on the clinical CSV (4-class ADHD dataset) augmented
with synthetic job characteristics and semi-supervised targets derived from impairment
vs job-environment fit. At inference, questionnaire + occupation features are used;
clinical columns not collected from users are imputed from class-conditional means
mapped from adhd_profile_type → Diagnosis_Class.
"""

from __future__ import annotations

import csv
import logging
import math
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import joblib
import numpy as np

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------
_SERVICE_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SERVICE_DIR.parent.parent.parent
_DEFAULT_CSV = _REPO_ROOT / "data" / "ADHD dataset 4 classes u2.csv"
_MODEL_DIR = _SERVICE_DIR.parent / "models" / "ml"
_MODEL_PATH = _MODEL_DIR / "job_success_rf.joblib"
_META_PATH = _MODEL_DIR / "job_success_rf.meta.joblib"

# Map app profile strings → Diagnosis_Class in CSV (see Q1/Q2 mean patterns)
PROFILE_TO_DIAGNOSIS_CLASS = {
    "inattentive": 2,
    "hyperactive-impulsive": 1,
    "combined": 3,
}

# Multi-hot label order (must match corrected_job_score_model_v2)
WORK_PREF_KEYS: Tuple[str, ...] = (
    "Clear priorities",
    "Short tasks",
    "Visual workflow",
    "Low interruptions",
    "Collaborative team",
    "Quiet work blocks",
)

SUPPORT_KEYS: Tuple[str, ...] = (
    "Written instructions",
    "Calendar reminders",
    "Checklists",
    "Regular check-ins",
    "Flexible start time",
    "Noise-reduced space",
    "Task batching",
    "Break prompts",
)

ENERGY_KEYS: Tuple[str, ...] = (
    "Best with routine",
    "Best with variety",
    "Best with clear deadlines",
    "Best with flexible pace",
    "Best with short focus sprints",
    "Best with frequent breaks",
    "Best with visual task boards",
    "Best with one task at a time",
    "Best in quieter settings",
    "Best with accountability",
    "Best with body-doubling/accountability",
    "Best with morning deep work",
    "Best with afternoon deep work",
)

_Q1 = [f"Q1_{i}" for i in range(1, 10)]
_Q2 = [f"Q2_{i}" for i in range(1, 10)]

_model_lock = threading.Lock()
_cached_bundle: Optional[Dict[str, Any]] = None


def _rf_artifact_sig() -> Optional[tuple[float, float]]:
    """Invalidate cache when job_success_rf.joblib / .meta.joblib are replaced."""
    try:
        return (_MODEL_PATH.stat().st_mtime, _META_PATH.stat().st_mtime)
    except OSError:
        return None


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, x))))


def _safe_float(row: Dict[str, str], key: str, default: float = 0.0) -> float:
    try:
        return float(row.get(key, default) or default)
    except (TypeError, ValueError):
        return default


def row_impairment_and_stats(row: Dict[str, str]) -> Dict[str, float]:
    """Derive normalized impairment (0–1) and symptom summaries from one CSV row."""
    q1_sum = sum(_safe_float(row, k) for k in _Q1)
    q2_sum = sum(_safe_float(row, k) for k in _Q2)
    focus = _safe_float(row, "Focus_Score_Video")
    diff = _safe_float(row, "Difficulty_Organizing_Tasks")
    learn = _safe_float(row, "Learning_Difficulties")
    anx = _safe_float(row, "Anxiety_Depression_Levels")

    impair = (
        ((10.0 - focus) / 10.0) * 0.28
        + (diff / 3.0) * 0.24
        + (learn / 3.0) * 0.24
        + (anx / 3.0) * 0.24
    )
    impair = max(0.0, min(1.0, impair))
    age = _safe_float(row, "Age")
    return {
        "impairment": impair,
        "q1_mean": q1_sum / 27.0,
        "q2_mean": q2_sum / 27.0,
        "focus_norm": focus / 10.0,
        "age_norm": min(age / 40.0, 2.5) / 2.5,
    }


def _complexity_to_ord(complexity: str) -> float:
    c = (complexity or "medium").strip().lower()
    if c == "low":
        return 0.0
    if c == "high":
        return 2.0
    return 1.0


def _parse_hours(occupation: Dict[str, Any]) -> float:
    h = occupation.get("typical_hours_per_week")
    try:
        v = float(h)
    except (TypeError, ValueError):
        v = 40.0
    return max(10.0, min(60.0, v))


def skill_match_ratio(user_skills: List[str], job_skills: List[str]) -> float:
    """Overlap ratio 0–1 (same spirit as JobScoreModelV2 skill matching)."""
    if not job_skills:
        return 0.5
    if not user_skills:
        return 0.0

    def norm(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()

    def overlap(u: str, j: str) -> bool:
        uu, jj = norm(u), norm(j)
        if not uu or not jj:
            return False
        if uu == jj or uu in jj or jj in uu:
            return True
        ut = {t for t in uu.split() if len(t) > 2}
        jt = {t for t in jj.split() if len(t) > 2}
        if not ut or not jt:
            return False
        return len(ut & jt) / max(1, min(len(ut), len(jt))) >= 0.6

    strong = 0
    covered = set()
    job_norm = [norm(j) for j in job_skills if str(j or "").strip()]
    user_norm = [norm(u) for u in user_skills if str(u or "").strip()]
    for js in job_norm:
        for idx, us in enumerate(user_norm):
            if idx in covered:
                continue
            if overlap(us, js):
                strong += 1
                covered.add(idx)
                break
    return strong / max(1, len(job_norm))


def _multi_hot(selected: Sequence[str], universe: Tuple[str, ...]) -> List[float]:
    sset = set(selected or [])
    return [1.0 if u in sset else 0.0 for u in universe]


def _diag_one_hot(dc: int) -> List[float]:
    v = [0.0, 0.0, 0.0, 0.0]
    if 0 <= dc <= 3:
        v[dc] = 1.0
    return v


def build_feature_vector(
    user_questionnaire: Dict[str, Any],
    occupation: Dict[str, Any],
    person_imputed: Dict[str, float],
    diag_class: int,
) -> np.ndarray:
    """
    Fixed-order feature vector for sklearn (must match training).
    """
    adhd = user_questionnaire.get("adhd_profile_type") or "combined"
    type_oh = [
        1.0 if adhd == "inattentive" else 0.0,
        1.0 if adhd == "hyperactive-impulsive" else 0.0,
        1.0 if adhd == "combined" else 0.0,
    ]
    prefs = _multi_hot(user_questionnaire.get("work_preferences") or [], WORK_PREF_KEYS)
    supp = _multi_hot(user_questionnaire.get("support_needs") or [], SUPPORT_KEYS)
    energy = _multi_hot(user_questionnaire.get("energy_patterns") or [], ENERGY_KEYS)

    friend = float(occupation.get("adhd_friendliness_score") or 50.0)
    friend_n = max(0.0, min(100.0, friend)) / 100.0
    cx = _complexity_to_ord(str(occupation.get("work_complexity") or "Medium"))
    hours_n = _parse_hours(occupation) / 50.0
    skill_r = skill_match_ratio(
        list(user_questionnaire.get("skills") or []),
        list(occupation.get("implied_skills") or []),
    )

    vec = (
        type_oh
        + prefs
        + supp
        + energy
        + _diag_one_hot(diag_class)
        + [
            person_imputed.get("impairment", 0.5),
            person_imputed.get("q1_mean", 0.5),
            person_imputed.get("q2_mean", 0.5),
            person_imputed.get("focus_norm", 0.5),
            person_imputed.get("age_norm", 0.5),
            friend_n,
            cx / 2.0,
            hours_n,
            skill_r,
        ]
    )
    return np.asarray(vec, dtype=np.float64)


def _inference_feature_names() -> List[str]:
    """
    Human-readable names in the same order as build_feature_vector (for importance logging).
    """
    names: List[str] = [
        "profile_inattentive",
        "profile_hyperactive_impulsive",
        "profile_combined",
    ]
    names.extend(f"work_pref:{k}" for k in WORK_PREF_KEYS)
    names.extend(f"support:{k}" for k in SUPPORT_KEYS)
    names.extend(f"energy:{k}" for k in ENERGY_KEYS)
    names.extend(["diag_class_0", "diag_class_1", "diag_class_2", "diag_class_3"])
    names.extend(
        [
            "impairment_imputed",
            "q1_mean_imputed",
            "q2_mean_imputed",
            "focus_norm_imputed",
            "age_norm_imputed",
            "adhd_friendliness_n",
            "complexity_ord_scaled",
            "hours_per_week_n",
            "skill_match_ratio",
        ]
    )
    return names


def _load_csv_rows(path: Path) -> List[Dict[str, str]]:
    if not path.is_file():
        logger.warning("[ADHD ML] CSV not found at %s", path)
        return []
    rows: List[Dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _class_conditional_means(rows: List[Dict[str, str]]) -> Dict[int, Dict[str, float]]:
    buckets: Dict[int, List[Dict[str, float]]] = {0: [], 1: [], 2: [], 3: []}
    for row in rows:
        dc = int(float(row.get("Diagnosis_Class", 0)))
        if dc not in buckets:
            continue
        buckets[dc].append(row_impairment_and_stats(row))

    out: Dict[int, Dict[str, float]] = {}
    keys = ["impairment", "q1_mean", "q2_mean", "focus_norm", "age_norm"]
    for dc in range(4):
        items = buckets.get(dc) or []
        if not items:
            out[dc] = {k: 0.5 for k in keys}
            continue
        out[dc] = {k: float(np.mean([x[k] for x in items])) for k in keys}
    return out


def impute_person_features(adhd_profile_type: str, class_means: Dict[int, Dict[str, float]]) -> Tuple[Dict[str, float], int]:
    """Return imputed person stats + diagnosis class used."""
    dc = PROFILE_TO_DIAGNOSIS_CLASS.get(adhd_profile_type, 3)
    base = dict(class_means.get(dc) or class_means.get(3) or {"impairment": 0.5, "q1_mean": 0.5, "q2_mean": 0.5, "focus_norm": 0.5, "age_norm": 0.5})
    return base, dc


def _synthetic_target(
    impair: float,
    job_friendliness: float,
    complexity_ord: float,
    hours_norm: float,
) -> float:
    """Semi-supervised outcome 0–1: environment fit minus impairment."""
    jfit = (job_friendliness / 100.0) * (1.0 - 0.1 * complexity_ord) * (1.0 - 0.12 * abs(hours_norm - 0.82))
    z = 3.2 * (jfit - 0.52 * impair - 0.08)
    return _sigmoid(z)


def _sample_random_preferences(rng: np.random.Generator) -> Tuple[List[str], List[str], List[str]]:
    """During training, simulate sparse questionnaire selections."""

    def pick(keys: Tuple[str, ...], n: int) -> List[str]:
        n = max(0, min(int(n), len(keys)))
        if n == 0:
            return []
        idx = rng.choice(len(keys), size=n, replace=False)
        return [keys[i] for i in idx]

    n_work = int(rng.integers(0, 3))
    n_sup = int(rng.integers(0, 3))
    n_en = int(rng.integers(0, 3))
    return (pick(WORK_PREF_KEYS, n_work), pick(SUPPORT_KEYS, n_sup), pick(ENERGY_KEYS, n_en))


def train_random_forest(rows: List[Dict[str, str]], rng: np.random.Generator) -> Tuple[Any, List[str], Dict[int, Dict[str, float]]]:
    from sklearn.ensemble import RandomForestRegressor

    class_means = _class_conditional_means(rows)
    X_list: List[np.ndarray] = []
    y_list: List[float] = []

    profiles_cycle = ("inattentive", "hyperactive-impulsive", "combined")

    for row in rows:
        stats = row_impairment_and_stats(row)
        impair = stats["impairment"]
        dc = int(float(row.get("Diagnosis_Class", 0)))

        for _ in range(2):
            friend = float(rng.uniform(22.0, 98.0))
            cx = float(rng.integers(0, 3))
            hours_n = float(rng.uniform(0.55, 1.15))
            uq = {
                "adhd_profile_type": rng.choice(profiles_cycle),
                "work_preferences": [],
                "support_needs": [],
                "energy_patterns": [],
                "skills": [],
            }
            wp, sp, en = _sample_random_preferences(rng)
            uq["work_preferences"] = wp
            uq["support_needs"] = sp
            uq["energy_patterns"] = en

            fake_occ = {
                "adhd_friendliness_score": friend,
                "work_complexity": ["Low", "Medium", "High"][int(cx)],
                "typical_hours_per_week": int(hours_n * 50),
                "implied_skills": ["Skill_A", "Skill_B", "Skill_C"],
            }
            person_imputed = {
                "impairment": impair,
                "q1_mean": stats["q1_mean"],
                "q2_mean": stats["q2_mean"],
                "focus_norm": stats["focus_norm"],
                "age_norm": stats["age_norm"],
            }
            y = _synthetic_target(impair, friend, cx, hours_n)
            feat = build_feature_vector(uq, fake_occ, person_imputed, dc)
            X_list.append(feat)
            y_list.append(y)

    if len(X_list) < 50:
        raise RuntimeError("Not enough training rows for ADHD ML layer.")

    X = np.vstack(X_list)
    y = np.asarray(y_list, dtype=np.float64)
    model = RandomForestRegressor(
        n_estimators=96,
        max_depth=16,
        min_samples_leaf=6,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)
    feature_names = [f"f{i}" for i in range(X.shape[1])]
    return model, feature_names, class_means


def _ensure_model_bundle() -> Dict[str, Any]:
    global _cached_bundle
    csv_path = Path(os.environ.get("ADHD_DATASET_CSV", str(_DEFAULT_CSV)))

    with _model_lock:
        sig = _rf_artifact_sig()
        if _cached_bundle is not None and _cached_bundle.get("artifact_sig") == sig:
            return _cached_bundle

        _MODEL_DIR.mkdir(parents=True, exist_ok=True)

        if _MODEL_PATH.is_file() and _META_PATH.is_file():
            try:
                model = joblib.load(_MODEL_PATH)
                meta = joblib.load(_META_PATH)
                sig = _rf_artifact_sig()
                _cached_bundle = {
                    "model": model,
                    "class_means": meta["class_means"],
                    "feature_len": meta["feature_len"],
                    "artifact_sig": sig,
                }
                logger.info("[ADHD ML] Loaded trained model from %s (mtime sig refreshed)", _MODEL_PATH)
                return _cached_bundle
            except Exception as e:
                logger.warning("[ADHD ML] Failed to load cached model: %s — retraining.", e)

        rows = _load_csv_rows(csv_path)
        if not rows:
            logger.warning("[ADHD ML] No CSV data — ML layer disabled.")
            _cached_bundle = {
                "model": None,
                "class_means": {},
                "feature_len": None,
                "artifact_sig": _rf_artifact_sig(),
            }
            return _cached_bundle

        rng = np.random.default_rng(42)
        model, _, class_means = train_random_forest(rows, rng)
        joblib.dump(model, _MODEL_PATH)
        feat_dim = None
        try:
            feat_dim = int(model.n_features_in_)
        except Exception:
            pass
        joblib.dump({"class_means": class_means, "feature_len": feat_dim}, _META_PATH)
        sig = _rf_artifact_sig()
        _cached_bundle = {
            "model": model,
            "class_means": class_means,
            "feature_len": feat_dim,
            "artifact_sig": sig,
        }
        logger.info("[ADHD ML] Trained and saved RandomForestRegressor (%s rows)", len(rows))
        return _cached_bundle


def predict_ml_success_probability(
    user_questionnaire: Dict[str, Any],
    occupation: Dict[str, Any],
) -> Tuple[Optional[float], Dict[str, Any]]:
    """
    Returns (probability 0–1, debug dict). None if ML unavailable.
    """
    bundle = _ensure_model_bundle()
    model = bundle.get("model")
    class_means: Dict[int, Dict[str, float]] = bundle.get("class_means") or {}

    if model is None:
        return None, {"error": "ml_model_unavailable"}

    adhd_type = user_questionnaire.get("adhd_profile_type") or "combined"
    person_imputed, dc = impute_person_features(adhd_type, class_means)
    x = build_feature_vector(user_questionnaire, occupation, person_imputed, dc)
    x = x.reshape(1, -1)

    try:
        expected = getattr(model, "n_features_in_", None)
        if expected is not None and x.shape[1] != int(expected):
            logger.error("[ADHD ML] Feature dim mismatch: got %s expected %s", x.shape[1], expected)
            return None, {"error": "feature_mismatch"}
    except Exception:
        pass

    raw = float(model.predict(x)[0])
    prob = max(0.0, min(1.0, raw))

    debug_out: Dict[str, Any] = {
        "diagnosis_class_used": dc,
        "person_imputed": person_imputed,
        "raw_prediction_pre_clamp": raw,
        "raw_prediction": prob,
    }

    fi = getattr(model, "feature_importances_", None)
    names = _inference_feature_names()
    if fi is not None and len(fi) == x.shape[1] and len(names) == len(fi):
        top_indices = np.argsort(np.asarray(fi))[-5:][::-1]
        top_features: List[Dict[str, Any]] = []
        for idx in top_indices:
            i = int(idx)
            top_features.append(
                {
                    "feature_index": i,
                    "importance": float(fi[i]),
                    "feature_name": names[i] if i < len(names) else f"feature_{i}",
                }
            )
        debug_out["top_features_by_importance"] = top_features
        logger.info("[ML DEBUG] clinical_rf prediction raw=%.6f prob_clamped=%.6f", raw, prob)
        logger.info("[ML DEBUG] Top 5 global feature importances (RandomForest):")
        for tf in top_features:
            logger.info(
                "  %s (idx=%s) importance=%.6f",
                tf.get("feature_name"),
                tf.get("feature_index"),
                tf.get("importance"),
            )
    elif fi is not None:
        logger.warning(
            "[ML DEBUG] feature_importances_ length %s vs vector %s — skipping named importance",
            getattr(fi, "__len__", lambda: 0)(),
            x.shape[1],
        )

    return prob, debug_out


def ml_score_0_100(prob: float) -> float:
    return round(100.0 * prob, 2)


def reset_cache_for_tests() -> None:
    global _cached_bundle
    _cached_bundle = None
