"""
User-facing Work Environment Fit copy — supportive chips + summary only.

Does not expose weights, ML internals, or scoring formulas.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

# -----------------------------------------------------------------------------
# Helpers: normalize posting signals to tier tokens
# -----------------------------------------------------------------------------


def _norm_tri(v: object) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", str(v or "").lower()).strip()
    if any(x in s for x in ("high", "heavy", "frequent", "constant")):
        return "high"
    if any(x in s for x in ("medium", "moderate", "mixed")):
        return "medium"
    if any(x in s for x in ("low", "minimal", "light", "quiet", "rare")):
        return "low"
    return ""


def _norm_pace(v: object) -> str:
    s = str(v or "").lower()
    if "fast" in s or "rapid" in s:
        return "fast"
    if "slow" in s:
        return "slow"
    return "moderate" if s else ""


def _norm_comm(v: object) -> str:
    s = str(v or "").lower()
    if "written" in s:
        return "written"
    if "verbal" in s or "oral" in s:
        return "verbal"
    return "mixed" if s else ""


def _merge_job_signals(fit: Dict[str, Any], detail: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Flatten Gemini job_fit + optional work_environment_detail."""
    out: Dict[str, str] = {}
    for k, v in (fit or {}).items():
        if v is not None and str(v).strip():
            out[str(k)] = str(v).strip()
    if isinstance(detail, dict):
        for k, v in detail.items():
            if v is not None and str(v).strip():
                key = str(k)
                if key not in out or out[key] in ("", "mixed", "medium"):
                    out[key] = str(v).strip()
    intr = out.get("interrupt_frequency") or out.get("interruptions")
    if intr:
        out["_intr_tier"] = _norm_tri(intr)
    pace = out.get("pace")
    if pace:
        out["_pace_tier"] = _norm_pace(pace)
    comm = out.get("communication_style")
    if comm:
        out["_comm_tier"] = _norm_comm(comm)
    return out


def _pref_labels(prefs: Sequence[str]) -> List[str]:
    return [str(p).strip() for p in prefs if str(p).strip()]


def build_work_environment_fit_ui(
    *,
    normalized_job_fit: Dict[str, Any],
    work_environment_detail: Optional[Dict[str, Any]],
    work_preferences: Sequence[str],
    support_needs: Sequence[str],
    energy_patterns: Sequence[str],
    adhd_profile_type: str,
    work_style_score_0_100: Optional[float],
) -> Dict[str, Any]:
    """
    Returns JSON suitable for the Job Score “Work Environment Fit” module.

    fit_score mirrors the model’s work-style component (0–100) when provided.
    """
    wp = _pref_labels(work_preferences)[:2]
    sn = _pref_labels(support_needs)[:2]
    en = _pref_labels(energy_patterns)

    sig = _merge_job_signals(normalized_job_fit or {}, work_environment_detail)

    comfortable: List[str] = []
    challenges: List[str] = []
    supports_out: List[str] = []

    intr = sig.get("_intr_tier") or _norm_tri(sig.get("interrupt_frequency") or sig.get("interruptions"))
    ts = str(sig.get("task_structure") or "").lower()
    collab = sig.get("collaboration") or ""
    collab_t = _norm_tri(collab)
    cog = sig.get("cognitive_load") or ""
    cog_t = _norm_tri(cog)
    pace_t = sig.get("_pace_tier") or _norm_pace(sig.get("pace"))
    comm_t = sig.get("_comm_tier") or _norm_comm(sig.get("communication_style"))
    ws = str(sig.get("work_style") or "").lower()

    # --- Comfortable (alignment) ---
    if "Clear priorities" in wp and ts in ("structured", "mixed") and ts:
        comfortable.append("Clear priorities in how work is organised")
    if "Visual workflow" in wp and ts in ("structured", "mixed"):
        comfortable.append("Room for structured or visible planning")
    if "Collaborative team" in wp and collab_t in ("medium", "high"):
        comfortable.append("Team collaboration matches how you like to work")
    if "Quiet work blocks" in wp and intr == "low":
        comfortable.append("Opportunities for quieter focus time")
    if "Low interruptions" in wp and intr == "low":
        comfortable.append("Fewer interruptions day to day")

    if "Best with variety" in en and ts == "unstructured":
        comfortable.append("Variety in tasks — fits your energy pattern")
    if "Best with routine" in en and ts == "structured":
        comfortable.append("Predictable structure — fits your routine preference")

    # --- Challenges ---
    if intr == "high" and "Low interruptions" in wp:
        challenges.append("Frequent interruptions — may feel draining")
    if intr == "high" and "Quiet work blocks" in wp:
        challenges.append("Harder to protect quiet focus blocks")
    if pace_t == "fast" and ("Quiet work blocks" in wp or "Low interruptions" in wp):
        challenges.append("Fast pace — can add pressure between tasks")
    if cog_t == "high" and adhd_profile_type == "inattentive":
        challenges.append("Heavy cognitive load — may need extra pacing strategies")
    if ws == "context_switching" and "Best with one task at a time" in en:
        challenges.append("Lots of switching — may clash with one-thing-at-a-time rhythm")
    if comm_t == "verbal" and "Written instructions" in sn:
        challenges.append("Communication skews verbal — written preferences take extra effort")
    if collab_t == "high" and "Collaborative team" not in wp:
        challenges.append("Very collaborative role — may mean more meetings than solo time")

    # --- Helpful supports (tie to posting friction + profile) ---
    if intr == "high" and "Written instructions" not in sn:
        supports_out.append("Written instructions")
    elif intr == "high":
        supports_out.append("Clear written expectations between meetings")

    if challenges and "Noise-reduced space" not in sn and "Noise-reduced space" not in supports_out:
        supports_out.append("Noise-reduced space")
    if intr == "high" or pace_t == "fast":
        if "Break prompts" not in supports_out:
            supports_out.append("Break prompts")
    if ts == "unstructured" and "Checklists" not in supports_out:
        supports_out.append("Checklists")
    if comm_t == "verbal" and "Written instructions" in sn:
        supports_out.append("Follow-ups in writing after verbal updates")

    # Dedupe / cap
    def dedupe(xs: List[str], cap: int) -> List[str]:
        seen = set()
        out_list = []
        for x in xs:
            k = x.lower()
            if k not in seen:
                seen.add(k)
                out_list.append(x)
            if len(out_list) >= cap:
                break
        return out_list

    comfortable = dedupe(comfortable, 5)
    challenges = dedupe(challenges, 5)
    supports_out = dedupe(supports_out, 5)

    # Prefer profile-selected supports when they address challenges
    for s in sn:
        if s not in supports_out and len(supports_out) < 5:
            supports_out.append(s)

    fit_score: Optional[int] = None
    if work_style_score_0_100 is not None:
        try:
            fit_score = int(round(float(work_style_score_0_100)))
            fit_score = max(0, min(100, fit_score))
        except (TypeError, ValueError):
            fit_score = None

    summary = _build_summary_sentence(
        comfortable,
        challenges,
        adhd_profile_type,
        fit_score,
    )

    return {
        "fit_score": fit_score,
        "comfortable_areas": comfortable,
        "challenge_areas": challenges,
        "recommended_supports": supports_out[:5],
        "summary": summary,
    }


def _build_summary_sentence(
    comfortable: List[str],
    challenges: List[str],
    _adhd_profile_type: str,
    fit_score: Optional[int],
) -> str:
    if comfortable and challenges:
        return (
            f"This role may suit {comfortable[0].lower()}, "
            f"but {challenges[0].lower()}."
        )
    if challenges:
        return f"Something to plan for: {challenges[0].lower()}."
    if comfortable:
        return f"This role lines up with {comfortable[0].lower()}."
    if fit_score is not None and fit_score >= 60:
        return "Overall, the posting’s pace and structure look workable with your preferences."
    return (
        "Compare how you like to work with how this role runs day to day. "
        "Adjust your preferences below to explore what changes the fit."
    )
