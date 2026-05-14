"""
Infer coarse job signals from DB occupation fields + implied_skills only (no job title substring logic).
Used when Gemini structured fit is unavailable.
"""

from __future__ import annotations

from typing import Dict, List


def _blob_skills(occupation: Dict) -> str:
    raw = occupation.get("implied_skills") or []
    if isinstance(raw, str):
        return raw.lower()
    return " ".join(str(x) for x in raw).lower()


def fallback_job_trait_map(occupation: Dict) -> Dict[str, bool]:
    """
    Map internal WORK_PREFERENCES / SUPPORT_NEEDS / ENERGY_PATTERNS keys to booleans.
    """
    friend = float(occupation.get("adhd_friendliness_score") or 50)
    cx = str(occupation.get("work_complexity") or "Medium").lower()
    blob = _blob_skills(occupation)

    structured_hint = cx in ("low", "medium") or friend >= 56
    fluid_high_load = cx == "high" and friend < 45
    focus_friendly = friend >= 50
    team_words = ("communication", "stakeholder", "client", "team", "present", "sales")
    tech_words = (
        "python",
        "java",
        "sql",
        "javascript",
        "testing",
        "git",
        "analysis",
        "data",
        "develop",
        "design",
        "cloud",
    )
    team_signal = any(w in blob for w in team_words)
    tech_signal = any(w in blob for w in tech_words)

    return {
        # Work preference trait ids (must match WORK_PREFERENCES values in model)
        "needs_clear_goals": structured_hint,
        "needs_task-variety": fluid_high_load or (cx == "high" and friend < 52),
        "needs_visual_management": "design" in blob or "ui" in blob or "ux" in blob or tech_signal,
        "needs_focus_time": focus_friendly and cx != "high",
        "needs_teamwork": team_signal,
        "needs_quiet_env": friend >= 58 and not team_signal,
        # Support needs
        "supports_documentation": any(w in blob for w in ("documentation", "report", "excel", "compliance")),
        "supports_scheduling": any(w in blob for w in ("plan", "project", "coordination", "calendar")),
        "supports_task_management": any(w in blob for w in ("project", "plan", "organ", "jira", "agile")),
        "supports_accountability": team_signal,
        "supports_schedule_flexibility": any(w in blob for w in ("remote", "flex", "consult", "freelance")),
        "supports_quiet_env": friend >= 58,
        "supports_focus_blocks": tech_signal and friend >= 54,
        "supports_breaks": any(w in blob for w in ("retail", "shift", "floor", "service")),
        # Energy patterns
        "energy_routine": cx in ("low", "medium") and friend >= 48,
        "energy_variety": cx == "high" or fluid_high_load,
        "energy_deadline_driven": any(w in blob for w in ("project", "agile", "delivery", "release")),
        "energy_flexible": any(w in blob for w in ("remote", "flex", "consult")),
        "energy_sprints": tech_signal,
        "energy_breaks_needed": any(w in blob for w in ("shift", "floor", "service")),
        "energy_visual": any(w in blob for w in ("design", "ui", "ux", "visual")),
        "energy_sequential": any(w in blob for w in ("analysis", "data", "qa", "test")),
        "energy_quiet": friend >= 58,
        "energy_presence": team_signal,
        # Weak priors when Gemini is unavailable — deep-work-friendly roles often suit morning/afternoon blocks
        "energy_morning": focus_friendly and cx != "high",
        "energy_afternoon": focus_friendly and cx != "high",
    }


def trait_match_rate(selected_labels: List[str], mapping: Dict[str, str], traits: Dict[str, bool]) -> float:
    """Fraction of selected items whose mapped trait is True."""
    if not selected_labels:
        return 0.0
    keys = [mapping.get(label, "") for label in selected_labels]
    keys = [k for k in keys if k]
    if not keys:
        return 0.0
    hits = sum(1 for k in keys if traits.get(k, False))
    return hits / len(keys)
