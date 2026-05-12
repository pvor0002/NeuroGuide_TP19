"""
Experience vs posting requirement — supportive UI payload + light score nudge.

Does not expose internal weights; penalty is capped and reduced when the posting is
entry-friendly or skills overlap strongly.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple


def role_duration_to_estimated_years(duration: Optional[str]) -> float:
    """Map wizard duration bands to a single numeric estimate for comparison."""
    d = str(duration or "").strip().lower()
    if not d:
        return 0.5
    if "intern" in d:
        return 0.35
    if "6 month" in d or d.startswith("6"):
        return 0.5
    if "1-2" in d or "1–2" in d or "one to two" in d:
        return 1.25
    return 1.0


def _skills_overlap_ratio(factors: Dict[str, Any]) -> float:
    sk = factors.get("skills") if isinstance(factors.get("skills"), dict) else {}
    user_skills = sk.get("user_skills") or []
    job_skills = sk.get("job_skills") or []
    if not job_skills:
        return 0.5
    u = {str(x).lower().strip() for x in user_skills if str(x).strip()}
    j = [str(x).lower().strip() for x in job_skills if str(x).strip()]
    if not j:
        return 0.5
    hits = sum(1 for x in j if any(x == y or x in y or y in x for y in u))
    return min(1.0, hits / max(1, len(j)))


_ENTRYISH = re.compile(
    r"\b(intern|internship|graduate|jr\.?|junior|entry[\s-]?level|student|early[\s-]?career|placement)\b",
    re.I,
)


def _posting_entry_friendly(
    job_fit: Optional[Dict[str, Any]],
    job_title_hint: str,
) -> bool:
    if isinstance(job_fit, dict) and job_fit.get("entry_level_friendly") is True:
        return True
    title = str(job_title_hint or "")
    if _ENTRYISH.search(title):
        return True
    return False


def build_experience_fit_and_penalty(
    *,
    user_questionnaire: Dict[str, Any],
    job_fit_features: Optional[Dict[str, Any]],
    factor_breakdown: Dict[str, Any],
    job_title_hint: str = "",
) -> Tuple[Dict[str, Any], float]:
    """
    Returns (experience_fit dict for API/UI, penalty_points to subtract from score 0-100).
    """
    role_duration = str(user_questionnaire.get("role_duration") or "")
    user_years = role_duration_to_estimated_years(role_duration)

    req_raw = None
    if isinstance(job_fit_features, dict):
        req_raw = job_fit_features.get("required_experience_years")

    required_years: Optional[float] = None
    if req_raw is not None:
        try:
            required_years = float(req_raw)
        except (TypeError, ValueError):
            required_years = None

    fit: Dict[str, Any] = {
        "status": "good",
        "label": "Good match",
        "message": "",
        "required_years": required_years,
        "user_years": round(user_years, 2),
        "score_adjustment_applied": 0.0,
    }

    penalty = 0.0

    if required_years is None or required_years <= 0:
        return fit, penalty

    gap = float(required_years) - float(user_years)

    entry_ok = _posting_entry_friendly(job_fit_features, job_title_hint)
    overlap = _skills_overlap_ratio(factor_breakdown)

    if gap <= 1.0:
        fit["status"] = "good"
        fit["label"] = "Good match"
        fit["message"] = ""
        return fit, penalty

    if gap <= 2.5:
        fit["status"] = "moderate"
        fit["label"] = "Moderate match"
        fit["message"] = (
            "This posting asks for more tenure than your profile shows so far — "
            "worth discussing how your skills translate."
        )
        penalty = min(2.5, 1.0 + gap * 0.35)
    else:
        fit["status"] = "gap"
        fit["label"] = "Experience gap"
        if user_years <= 1.5 and required_years >= 4:
            fit["message"] = (
                "This role expects significantly more experience than your current profile suggests — "
                "you may still apply if you highlight transferable projects."
            )
        else:
            fit["message"] = (
                "This position may feel demanding compared with your experience band — "
                "consider roles that emphasise growth or mentorship."
            )
        penalty = min(5.0, 2.0 + gap * 0.55)

    if entry_ok:
        penalty *= 0.25

    if overlap >= 0.55:
        penalty *= 0.55
    elif overlap >= 0.35:
        penalty *= 0.75

    penalty = max(0.0, min(5.0, penalty))

    fit["score_adjustment_applied"] = round(-penalty, 2)
    return fit, penalty
