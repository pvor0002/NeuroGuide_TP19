"""
Map Gemini-extracted job environment signals to user ADHD preferences (rule layer).

Used when ``job_fit_features`` are present; otherwise keyword fallbacks apply.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# -----------------------------------------------------------------------------
# Normalization (Gemini synonym tolerance)
# -----------------------------------------------------------------------------


def _sniff(value: object, *keywords: str) -> bool:
    if value is None:
        return False
    s = re.sub(r"[^a-z0-9]+", " ", str(value).lower())
    return any(k in s for k in keywords)


def normalize_gemini_job_fit(raw: Optional[Dict]) -> Dict[str, Optional[str]]:
    if not raw or not isinstance(raw, dict):
        return {}

    def ts(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).lower()
        if _sniff(v, "semi-structured", "semi structured", "semistructured"):
            return "mixed"
        if _sniff(v, "unstructured", "fluid", "adhoc", "ambiguous"):
            return "unstructured"
        if _sniff(v, "mixed", "hybrid", "blend"):
            return "mixed"
        if _sniff(v, "structured", "clear roadmap", "defined"):
            return "structured"
        return None

    def we(v: object) -> Optional[str]:
        if v is None:
            return None
        if _sniff(v, "quiet", "heads-down", "solo", "minimal meeting"):
            return "quiet"
        if _sniff(v, "collabor", "team", "pair", "standup"):
            return "collaborative"
        if _sniff(v, "fast", "rapid", "high tempo", "deadline"):
            return "fast-paced"
        if _sniff(v, "mixed"):
            return "mixed"
        return None

    def cog_load(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).lower()
        if "low" in s or "light" in s:
            return "low"
        if "medium" in s or "moderate" in s or "mid" in s:
            return "medium"
        if "high" in s or "heavy" in s or "intense" in s:
            return "high"
        return None

    def autonomy_lvl(v: object) -> Optional[str]:
        return cog_load(v)

    def bin_lo_hi(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).lower()
        if "low" in s or "minimal" in s or "rare" in s:
            return "low"
        if "high" in s or "frequent" in s or "constant" in s:
            return "high"
        return None

    def tri_level(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).lower()
        if any(x in s for x in ("low", "minimal", "light")):
            return "low"
        if any(x in s for x in ("medium", "moderate", "balanced")):
            return "medium"
        if any(x in s for x in ("high", "heavy", "constant")):
            return "high"
        return None

    def work_style_norm(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).lower()
        if _sniff(v, "deep", "focus", "sustained", "concentrat"):
            return "deep_focus"
        if _sniff(v, "context", "switch", "multitas"):
            return "context_switching"
        if _sniff(v, "mixed"):
            return "mixed"
        return None

    raw_intr = raw.get("interruptions")
    attn = bin_lo_hi(raw.get("attention_switching"))
    intr_tri = tri_level(raw_intr)
    if attn is None and intr_tri == "low":
        attn = "low"
    elif attn is None and intr_tri == "high":
        attn = "high"

    out: Dict[str, Optional[str]] = {
        "task_structure": ts(raw.get("task_structure")),
        "work_environment": we(raw.get("work_environment")),
        "cognitive_load": cog_load(raw.get("cognitive_load")),
        "attention_switching": attn,
        "deadline_pressure": bin_lo_hi(raw.get("deadline_pressure")),
        "autonomy": autonomy_lvl(raw.get("autonomy")),
        "work_style": work_style_norm(raw.get("work_style")),
        "collaboration": tri_level(raw.get("collaboration")),
        "interrupt_frequency": intr_tri,
    }
    return out


# Neutral fallbacks so scoring never sees bare None when the client sent job_fit_features.
JOB_FIT_DEFAULTS: Dict[str, str] = {
    "task_structure": "mixed",
    "work_environment": "mixed",
    "cognitive_load": "medium",
    "attention_switching": "low",
    "deadline_pressure": "low",
    "autonomy": "medium",
    "work_style": "mixed",
    "collaboration": "medium",
    "interrupt_frequency": "medium",
}


def apply_job_fit_defaults(fit: Dict[str, Optional[str]]) -> Dict[str, str]:
    """Fill missing Gemini dimensions with neutral defaults (explicit extractions still win)."""
    out: Dict[str, str] = {}
    for k, dv in JOB_FIT_DEFAULTS.items():
        v = fit.get(k)
        if v is None or (isinstance(v, str) and not str(v).strip()):
            out[k] = dv
        else:
            out[k] = str(v).strip()
    return out


def job_fit_is_usable(fit: Dict[str, Optional[str]]) -> bool:
    return any(v is not None for v in fit.values())


def _pref_alignment_score(p: str, fit: Dict[str, Optional[str]]) -> float:
    """
    Return 0..1 alignment for one selected work preference vs Gemini dimensions.
    Only selected prefs are evaluated (no penalty for prefs the user did not pick).
    """
    ts = fit.get("task_structure")
    we = fit.get("work_environment")
    att = fit.get("attention_switching")
    collab = fit.get("collaboration")
    intr = fit.get("interrupt_frequency")
    ws = fit.get("work_style")

    if p == "Clear priorities":
        if ts == "structured":
            return 1.0
        if ts == "mixed":
            return 0.62
        if ts == "unstructured":
            return 0.22
        return 0.42

    if p == "Short tasks":
        if att == "low":
            return 1.0
        if att == "high":
            return 0.28
        return 0.52

    if p == "Visual workflow":
        if ts in ("structured", "mixed") or ws == "deep_focus":
            return 1.0
        if ts == "unstructured":
            return 0.28
        return 0.55

    if p == "Low interruptions":
        if intr == "low":
            return 1.0
        if intr == "medium":
            return 0.58
        if intr == "high":
            return 0.18
        if we in ("quiet", "mixed") and att == "low":
            return 0.78
        if we == "fast-paced":
            return 0.24
        if ws == "deep_focus":
            return 0.68
        return 0.46

    if p == "Collaborative team":
        if collab in ("high", "medium") or we == "collaborative":
            return 1.0
        if collab == "low" and we == "quiet":
            return 0.22
        if collab == "low":
            return 0.38
        return 0.56

    if p == "Quiet work blocks":
        if intr == "low" and we in ("quiet", "mixed", "collaborative", "fast-paced"):
            return 1.0 if we in ("quiet", "mixed") else 0.72
        if intr == "medium" and we in ("quiet", "mixed"):
            return 0.66
        if intr == "high":
            return 0.18
        if we == "fast-paced":
            return 0.24
        if ws == "deep_focus":
            return 0.72
        return 0.46

    return 0.45


def _rate_prefs_work_gemini(
    prefs: List[str],
    fit: Dict[str, Optional[str]],
) -> Tuple[float, str]:
    """
    Score only selected work preferences against Gemini job-fit dimensions.
    Uses average alignment (0–1) → continuous adjustment in [-15, +15] so sparse
    selections (e.g. 2/2 strong) are not bucket-penalized like 2/6 missing.
    """
    if not prefs:
        return 0.0, "No preferences specified"

    scores = [_pref_alignment_score(p, fit) for p in prefs]
    rate = sum(scores) / max(1.0, float(len(prefs)))
    # Neutral point ~0.45 so compatible roles skew slightly positive
    adj = (rate - 0.45) * 36.0
    adj = max(-15.0, min(15.0, adj))

    detail = (
        f"{len(prefs)} selected preference(s); mean alignment ≈ {rate:.0%} vs posting "
        f"(task_structure, interrupt_frequency, collaboration, work_environment, work_style)."
    )
    return adj, detail


def _rate_support_gemini(
    needs: List[str],
    fit: Dict[str, Optional[str]],
) -> Tuple[float, str]:
    if not needs:
        return 0.0, "No specific supports needed"

    ts = fit.get("task_structure")
    dp = fit.get("deadline_pressure")
    we = fit.get("work_environment")
    auto = fit.get("autonomy")

    hits = 0
    for n in needs:
        ok = False
        if n == "Written instructions" and ts == "structured":
            ok = True
        elif n == "Calendar reminders" and dp == "high":
            ok = True
        elif n == "Checklists" and ts == "structured":
            ok = True
        elif n == "Regular check-ins" and we == "collaborative":
            ok = True
        elif n == "Flexible start time" and auto in ("high", "medium"):
            ok = True
        elif n == "Noise-reduced space" and fit.get("work_environment") == "quiet":
            ok = True
        elif n == "Task batching" and ts == "structured":
            ok = True
        elif n == "Break prompts" and dp == "high":
            ok = True
        if ok:
            hits += 1

    rate = hits / max(1, len(needs))
    if rate >= 0.8:
        adj = 10.0
    elif rate >= 0.5:
        adj = 5.0
    elif rate >= 0.2:
        adj = -5.0
    else:
        adj = -10.0

    return adj, f"{hits}/{len(needs)} support signals align with posting structure/pace"


def _rate_energy_gemini(
    patterns: List[str],
    fit: Dict[str, Optional[str]],
) -> Tuple[float, str]:
    if not patterns:
        return 0.0, "No energy patterns specified"

    ts = fit.get("task_structure")
    dp = fit.get("deadline_pressure")
    we = fit.get("work_environment")
    auto = fit.get("autonomy")
    intr = fit.get("interrupt_frequency")

    hits = 0
    for pat in patterns:
        ok = False
        if pat == "Best with routine" and ts == "structured":
            ok = True
        elif pat == "Best with variety" and ts in ("unstructured", "mixed"):
            ok = True
        elif pat == "Best with clear deadlines" and dp == "high":
            ok = True
        elif pat == "Best with flexible pace" and auto in ("high", "medium"):
            ok = True
        elif pat == "Best with short focus sprints" and intr in ("high", "medium"):
            ok = True
        elif pat == "Best with frequent breaks" and dp == "high":
            ok = True
        elif pat == "Best with visual task boards" and ts in ("structured", "mixed"):
            ok = True
        elif pat == "Best with one task at a time" and intr == "low":
            ok = True
        elif pat == "Best in quieter settings" and we == "quiet":
            ok = True
        elif pat in ("Best with accountability", "Best with body-doubling/accountability") and we == "collaborative":
            ok = True
        elif pat == "Best with morning deep work" and intr == "low":
            ok = True
        elif pat == "Best with afternoon deep work" and intr == "low":
            ok = True
        if ok:
            hits += 1

    rate = hits / max(1, len(patterns))
    if rate >= 0.8:
        adj = 10.0
    elif rate >= 0.5:
        adj = 5.0
    elif rate >= 0.2:
        adj = -5.0
    else:
        adj = -10.0

    return adj, f"{hits}/{len(patterns)} energy patterns align with posting pace/structure"


def rate_complexity_gemini(adhd_type: str, fit: Dict[str, Optional[str]]) -> Tuple[float, str]:
    cog = fit.get("cognitive_load", "medium")
    intr = fit.get("interrupt_frequency", "medium")

    if adhd_type == "inattentive":
        if cog == "high" or intr == "high":
            return -10.0, "High cognitive load or interruptions — challenging for inattentive profile"
        if cog == "low" and intr == "low":
            return +10.0, "Posting suggests manageable load and fewer interruptions"
        return 0.0, "Mixed complexity signals vs inattentive profile"

    if adhd_type == "hyperactive-impulsive":
        if cog == "low" and intr in ("high", "medium"):
            return +8.0, "Active pace with lighter cognitive load may suit hyperactive-impulsive profile"
        if cog == "high" and intr == "low":
            return -6.0, "Heavy cognitive load with low stimulation may feel understimulating"
        return 0.0, "Mixed complexity signals vs hyperactive-impulsive profile"

    if cog == "medium" and intr in ("medium", "low"):
        return +6.0, "Balanced load and moderate interruptions — often workable for combined profile"
    if cog == "high" and intr == "high":
        return -8.0, "High load and interruptions — may overwhelm combined profile"
    return 0.0, "Mixed posting complexity vs combined profile"
