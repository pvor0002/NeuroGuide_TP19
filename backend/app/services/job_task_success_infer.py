"""
Inference for offline-trained task success classifier (job_success_model.pkl).

Builds a single-row feature vector aligned with training:
``feature_names.json`` + ``scaler.pkl`` + ``job_success_model.pkl``.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import pandas as pd

from app.services.gemini_job_fit_scoring import normalize_gemini_job_fit
from app.services.task_feature_pipeline import TASK_NUM_COLS, load_profile_templates

logger = logging.getLogger(__name__)

_SERVICE_DIR = Path(__file__).resolve().parent
_MODEL_DIR = _SERVICE_DIR.parent / "models" / "ml"
_REPO_ROOT = _SERVICE_DIR.parent.parent.parent

_DEFAULT_MODEL = _MODEL_DIR / "job_success_model.pkl"
_DEFAULT_SCALER = _MODEL_DIR / "scaler.pkl"
_DEFAULT_FEATURES = _MODEL_DIR / "job_success_feature_names.json"
_DEFAULT_META = _MODEL_DIR / "job_success_train_meta.json"
_DEFAULT_TEMPLATES = _REPO_ROOT / "data" / "adhd_profile_templates.json"

ADHD_PROFILE_TO_TEMPLATE_KEY = {
    "inattentive": "2",
    "hyperactive-impulsive": "1",
    "combined": "3",
}

_lock = threading.Lock()
_bundle: Optional[Dict[str, Any]] = None


def _load_training_medians() -> Tuple[float, float]:
    meta_path = Path(os.environ.get("JOB_SUCCESS_TRAIN_META", str(_DEFAULT_META)))
    if meta_path.is_file():
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            return float(meta.get("duration_median_fit", 65.0)), float(
                meta.get("interruptions_median_fit", 2.0)
            )
        except Exception as e:
            logger.warning("[TaskSuccessML] Could not read medians from meta: %s", e)
    return 65.0, 2.0


def _ensure_bundle() -> Optional[Dict[str, Any]]:
    global _bundle
    with _lock:
        if _bundle is not None:
            return _bundle

        model_p = Path(os.environ.get("JOB_SUCCESS_MODEL_PATH", str(_DEFAULT_MODEL)))
        scaler_p = Path(os.environ.get("JOB_SUCCESS_SCALER_PATH", str(_DEFAULT_SCALER)))
        feat_p = Path(os.environ.get("JOB_SUCCESS_FEATURE_NAMES_PATH", str(_DEFAULT_FEATURES)))

        if not model_p.is_file() or not scaler_p.is_file() or not feat_p.is_file():
            logger.info(
                "[TaskSuccessML] Missing artifacts (model=%s scaler=%s features=%s)",
                model_p.is_file(),
                scaler_p.is_file(),
                feat_p.is_file(),
            )
            _bundle = {"ok": False}
            return _bundle

        with open(feat_p, encoding="utf-8") as f:
            feature_names: List[str] = json.load(f)

        _bundle = {
            "ok": True,
            "model": joblib.load(model_p),
            "scaler": joblib.load(scaler_p),
            "feature_names": feature_names,
        }
        logger.info("[TaskSuccessML] Loaded classifier (%d features)", len(feature_names))
        return _bundle


def _complexity_str_to_ord(complexity: str) -> int:
    c = (complexity or "Medium").strip().lower()
    if c == "low":
        return 1
    if c == "high":
        return 3
    return 2


def _infer_task_type_flags(job_name: str) -> Tuple[bool, bool, bool]:
    """Approximate task_type_* dummies (admin dropped): creative, deep, routine."""
    n = (job_name or "").lower()
    creative = any(k in n for k in ("design", "creative", "ux", "developer", "software", "engineer"))
    deep = any(k in n for k in ("research", "architect", "scientist", "analyst", "developer"))
    routine = any(k in n for k in ("admin", "support", "data entry", "clerical"))
    if not (creative or deep or routine):
        creative = True
    return creative, deep, routine


def build_inference_feature_row(
    user_questionnaire: Dict[str, Any],
    occupation: Dict[str, Any],
    profiles: Dict[str, Any],
) -> pd.DataFrame:
    """
    Construct raw feature row (before scaler), then caller aligns + scales.
    """
    adhd_type = user_questionnaire.get("adhd_profile_type") or "combined"
    tpl_key = ADHD_PROFILE_TO_TEMPLATE_KEY.get(adhd_type, "3")
    profile = profiles[tpl_key]

    dur_med, int_med = _load_training_medians()

    friend = float(occupation.get("adhd_friendliness_score") or 50.0)
    occ_name = str(occupation.get("occupation_name") or "")
    task_complexity = _complexity_str_to_ord(str(occupation.get("work_complexity", "Medium")))

    hours = float(occupation.get("typical_hours_per_week") or 38)
    estimated_duration = float(min(180.0, max(15.0, hours * 1.8 + 20.0)))
    start_hour = 13
    time_since_last_break = float(min(180.0, max(10.0, 140.0 - friend * 0.8)))
    interruptions = float(max(0.0, min(8.0, 6.0 - friend / 25.0)))
    energy_level = float(max(1.0, min(6.0, 3.0 + friend / 80.0)))

    gf = occupation.get("gemini_job_fit")
    if isinstance(gf, dict) and gf:
        jf = normalize_gemini_job_fit(gf)
        att = jf.get("attention_switching")
        if att == "high":
            interruptions = min(8.0, interruptions + 2.0)
        elif att == "low":
            interruptions = max(0.0, interruptions - 1.0)
        if jf.get("deadline_pressure") == "high":
            time_since_last_break = max(10.0, time_since_last_break - 20.0)
        if jf.get("work_environment") == "fast-paced":
            energy_level = min(6.0, energy_level + 0.8)
        elif jf.get("work_environment") == "quiet":
            energy_level = max(1.0, energy_level - 0.4)

    fatigue = time_since_last_break * (1.0 - energy_level)
    long_task = estimated_duration > dur_med
    high_interruptions = interruptions > int_med

    creative, deep, routine = _infer_task_type_flags(occ_name)

    row: Dict[str, Any] = {
        "task_complexity": task_complexity,
        "estimated_duration": estimated_duration,
        "start_hour": start_hour,
        "time_since_last_break": time_since_last_break,
        "interruptions": interruptions,
        "energy_level": energy_level,
        "task_type_creative": int(creative),
        "task_type_deep": int(deep),
        "task_type_routine": int(routine),
        "long_task": int(long_task),
        "high_interruptions": int(high_interruptions),
        "fatigue": fatigue,
        "synthetic_adhd_type": int(tpl_key) if tpl_key.isdigit() else 3,
    }

    for k, v in profile.items():
        row[str(k)] = float(v)

    prev = "routine"
    if deep:
        prev = "deep"
    elif creative:
        prev = "creative"
    elif routine:
        prev = "routine"
    else:
        prev = "admin"

    row[f"previous_task_type_{prev}"] = 1

    df = pd.DataFrame([row])
    return df


def predict_task_success_probability(
    user_questionnaire: Dict[str, Any],
    occupation: Dict[str, Any],
) -> Tuple[Optional[float], Dict[str, Any]]:
    """
    Returns (positive_class_probability, debug_dict) or (None, ...) if artifacts missing.
    """
    bundle = _ensure_bundle()
    if not bundle or not bundle.get("ok"):
        return None, {"error": "task_success_model_unavailable"}

    tpl_path = Path(os.environ.get("ADHD_PROFILE_TEMPLATES", str(_DEFAULT_TEMPLATES)))
    if not tpl_path.is_file():
        return None, {"error": "adhd_profile_templates_missing"}

    profiles = load_profile_templates(tpl_path)
    raw_row = build_inference_feature_row(user_questionnaire, occupation, profiles)

    feature_names: List[str] = bundle["feature_names"]
    X = raw_row.reindex(columns=feature_names, fill_value=0)

    scaler = bundle["scaler"]
    model = bundle["model"]
    X_scaled = X.copy()
    try:
        X_scaled[TASK_NUM_COLS] = scaler.transform(X_scaled[TASK_NUM_COLS])
    except Exception as e:
        logger.exception("[TaskSuccessML] scaler transform failed: %s", e)
        return None, {"error": "scaler_transform_failed"}

    probs = model.predict_proba(X_scaled)[0]
    pos_idx = 1 if len(probs) > 1 else 0
    p = float(probs[pos_idx])
    return p, {"source": "task_rf_classifier", "n_features": len(feature_names)}


def reset_task_success_cache_for_tests() -> None:
    global _bundle
    _bundle = None
