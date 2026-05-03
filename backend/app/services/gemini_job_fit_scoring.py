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


def _rate_prefs_work_gemini(
    prefs: List[str],
    fit: Dict[str, Optional[str]],
) -> Tuple[float, str]:
    """Preference alignment using Gemini dimensions (+/-15 scale returned as adjustment)."""
    if not prefs:
        return 0.0, "No preferences specified"

    ts = fit.get("task_structure")
    we = fit.get("work_environment")
    att = fit.get("attention_switching")

    hits = 0
    reasons: List[str] = []

    for p in prefs:
        ok = False
        if p == "Clear priorities" and ts == "structured":
            ok = True
            reasons.append("structured work fits clear priorities")
        elif p == "Short tasks" and att == "low":
            ok = True
            reasons.append("fewer context switches")
        elif p == "Visual workflow" and (
            ts in ("structured", "mixed") or fit.get("work_style") == "deep_focus"
        ):
            ok = True
            reasons.append("structure/visual/deep-focus friendly flow")
        elif p == "Low interruptions":
            intr = fit.get("interrupt_frequency")
            if intr == "high":
                ok = False
            elif intr == "low":
                ok = True
                reasons.append("posting indicates low interruptions")
            else:
                ok = (
                    we in ("quiet", "mixed")
                    or att == "low"
                    or fit.get("work_style") == "deep_focus"
                )
                if ok:
                    reasons.append("quieter or low-switch environment")
        elif p == "Collaborative team" and (
            we == "collaborative" or fit.get("collaboration") in ("medium", "high")
        ):
            ok = True
            reasons.append("collaborative setting")
        elif p == "Quiet work blocks":
            intr = fit.get("interrupt_frequency")
            if intr == "high":
                ok = False
            elif intr == "low" or we == "quiet" or fit.get("work_style") == "deep_focus":
                ok = True
                reasons.append("focus blocks / low interrupt load")
            else:
                ok = intr != "high" and att == "low" and we != "fast-paced"
                if ok:
                    reasons.append("moderate switching; possible focus windows")

        if ok:
            hits += 1
        elif ts == "unstructured" and p in ("Clear priorities", "Visual workflow"):
            reasons.append(f"'{p}' may need extra scaffolding (role appears fluid)")
        elif we == "fast-paced" and p in ("Low interruptions", "Quiet work blocks"):
            reasons.append(f"'{p}' vs fast-paced setting")

    rate = hits / max(1, len(prefs))
    if rate >= 0.8:
        adj = 15.0
    elif rate >= 0.5:
        adj = 5.0
    elif rate >= 0.2:
        adj = -5.0
    else:
        adj = -15.0

    detail = "; ".join(reasons[:3]) if reasons else "Gemini job-fit vs work preferences"
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
    elif rate == 0:
        adj = -5.0
    else:
        adj = 0.0

    return adj, "Gemini-derived environment vs your support needs"


def _rate_energy_gemini(
    patterns: List[str],
    fit: Dict[str, Optional[str]],
) -> Tuple[float, str]:
    if not patterns:
        return 0.0, "No energy patterns specified"

    ts = fit.get("task_structure")
    we = fit.get("work_environment")
    dp = fit.get("deadline_pressure")
    att = fit.get("attention_switching")
    auto = fit.get("autonomy")
    cog = fit.get("cognitive_load")

    hits = 0
    for pat in patterns:
        ok = False
        if pat == "Best with routine" and ts == "structured":
            ok = True
        elif pat == "Best with variety" and we in ("fast-paced", "collaborative"):
            ok = True
        elif pat == "Best with clear deadlines" and dp == "high":
            ok = True
        elif pat == "Best with flexible pace" and auto == "high" and dp == "low":
            ok = True
        elif pat == "Best with short focus sprints" and att == "high":
            ok = True
        elif pat == "Best with frequent breaks" and we == "fast-paced":
            ok = True
        elif pat == "Best with visual task boards" and ts == "structured":
            ok = True
        elif pat == "Best with one task at a time" and att == "low":
            ok = True
        elif pat == "Best in quieter settings" and we == "quiet":
            ok = True
        elif pat in ("Best with accountability", "Best with body-doubling/accountability") and we == "collaborative":
            ok = True
        elif pat == "Best with morning deep work" and we in ("quiet", "mixed"):
            ok = True
        elif pat == "Best with afternoon deep work" and we in ("quiet", "mixed"):
            ok = True
        if ok:
            hits += 1

    if hits == len(patterns):
        adj = 10.0
    elif hits >= len(patterns) * 0.5:
        adj = 5.0
    else:
        adj = -10.0

    return adj, "Gemini environment vs your energy patterns"


def rate_complexity_gemini(adhd_type: str, fit: Dict[str, Optional[str]]) -> Tuple[float, str]:
    cog = fit.get("cognitive_load")
    auto = fit.get("autonomy")
    if not cog:
        return 0.0, "Cognitive load not inferred (from posting)"

    if adhd_type == "inattentive":
        if cog == "high":
            return -10.0, "High cognitive load may tax sustained attention"
        return 5.0, "Cognitive load appears manageable for inattentive profile"

    if adhd_type == "hyperactive-impulsive":
        if cog == "low" and auto == "low":
            return -5.0, "Low stimulation environment may feel understimulating"
        if cog in ("medium", "high"):
            return 5.0, "Enough cognitive engagement for stimulation"
        return 0.0, "Mixed cognitive fit for hyperactive-impulsive profile"

    if adhd_type == "combined":
        if cog == "medium":
            return 5.0, "Moderate cognitive load often workable with combined presentation"
        return 0.0, "Mixed cognitive demands—plan for adaptation strategies"

    return 0.0, "Complexity fit (Gemini)"
