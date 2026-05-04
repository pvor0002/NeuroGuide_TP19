#!/usr/bin/env python3
"""
JOB SCORE MODEL v2 — HYBRID (RULES + ML)
=========================================

Combines (1) explainable rule-based factors for UX and (2) a RandomForest regressor
trained on the clinical ADHD CSV (`data/ADHD dataset 4 classes u2.csv`) with
semi-supervised targets (impairment vs synthetic job environment). Final score:
``ml_w * ML + (1-ml_w) * rule_tilt`` where ``ml_w`` is 0.30–0.60 from ML probability uncertainty
(near 0.5 ⇒ favor rules until real training data), then nonlinear spread; display clamp [0, 100] for debugging.

The rule layer integrates the comprehensive user preference questionnaire:

1. TYPE CLASSIFICATION
   - ADHD Profile (from quiz or direct selection): inattentive, hyperactive-impulsive, combined

2. WORK PREFERENCES (all selected; weighted in scoring)
   - Clear priorities, Short tasks, Visual workflow, Low interruptions,
     Collaborative team, Quiet work blocks

3. SUPPORT SETUP
   A. Supports (all selected):
      - Written instructions, Calendar reminders, Checklists, Regular check-ins,
        Flexible start time, Noise-reduced space, Task batching, Break prompts
   
   B. Time & Energy (all selected):
      - Best with routine/variety/deadlines/flexible pace/sprints/breaks/boards/
        one-task/quiet/body-doubling/morning/afternoon

4. JOBS & SKILLS
   - Primary role (IT/software focused)
   - Duration in role (Internship, 6 months, 1-2 years)
   - Skills matched to experience

5. SOFT SKILLS (Gemini extraction + rule layer, when job_fit_features present)
   - job_fit_features.soft_skill_requirements: posting demand per dimension (low/medium/high).
   - User tiers inferred from work_preferences, support_needs, energy_patterns.
   - Adjustment capped and blended with other rule factors (see factor_breakdown.soft_skills).

The model uses these user inputs + ADHD training data to score job fit.
"""

import json
import logging
import math
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

from app.services.adhd_job_ml import (
    ml_score_0_100,
    predict_ml_success_probability,
)
from app.services.gemini_job_fit_scoring import (
    _rate_energy_gemini,
    _rate_prefs_work_gemini,
    _rate_support_gemini,
    apply_job_fit_defaults,
    normalize_gemini_job_fit,
    rate_complexity_gemini,
)
from app.services.job_task_success_infer import predict_task_success_probability as predict_task_classifier_prob
from app.services.occupation_fallback_signals import (
    fallback_job_trait_map,
    trait_match_rate,
)
from app.services.skill_match_enhanced import apply_skill_equivalence, skills_overlap_enhanced
from app.schemas.job_fit_features import SoftSkillRequirements

# Soft-skill dimensions (Gemini + rule layer); order stable for reasoning strings.
_SOFT_SKILL_KEYS = (
    "communication",
    "time_management",
    "problem_solving",
    "leadership",
    "teamwork",
    "adaptability",
    "self_motivation",
)


def _normalize_soft_demand_level(value: object) -> Optional[str]:
    """Map Gemini wording to low | medium | high."""
    if value is None:
        return None
    s = str(value).lower().strip()
    if not s:
        return None
    if any(x in s for x in ("low", "light", "minimal", "basic")):
        return "low"
    if any(x in s for x in ("medium", "moderate", "mid", "average", "balanced")):
        return "medium"
    if any(x in s for x in ("high", "heavy", "strong", "critical", "essential", "significant")):
        return "high"
    return None


def _soft_level_to_num(level: Optional[str]) -> Optional[int]:
    if level == "low":
        return 0
    if level == "medium":
        return 1
    if level == "high":
        return 2
    return None


class JobScoreModelV2:
    """
    Version 2: Incorporates comprehensive user questionnaire data.
    """

    # User preference mappings
    ADHD_PROFILE_TYPES = {
        'inattentive': {
            'label': 'Inattentive ADHD',
            'strengths': ['focus-when-interested', 'detail-orientation', 'hyperfocus'],
            'challenges': ['task-initiation', 'time-management', 'organization'],
            'needs': ['external-structure', 'clear-goals', 'routines', 'visual-systems'],
            'preferred_work': ['routine', 'structured', 'low-interrupt', 'deadline-driven']
        },
        'hyperactive-impulsive': {
            'label': 'Hyperactive-Impulsive ADHD',
            'strengths': ['high-energy', 'quick-thinking', 'enthusiasm', 'flexibility'],
            'challenges': ['impulse-control', 'task-completion', 'sitting-still'],
            'needs': ['variety', 'movement', 'stimulation', 'flexible-pacing'],
            'preferred_work': ['varied', 'fast-paced', 'physical', 'dynamic']
        },
        'combined': {
            'label': 'Combined ADHD',
            'strengths': ['creative', 'adaptable', 'persistent', 'high-energy'],
            'challenges': ['variable-focus', 'impulse-and-planning'],
            'needs': ['balanced-structure-flexibility', 'mixed-pace', 'frequent-change'],
            'preferred_work': ['mixed-structure-variety', 'flexible', 'engaging']
        }
    }

    # Work preference mappings to job characteristics
    WORK_PREFERENCES = {
        'Clear priorities': 'needs_clear_goals',
        'Short tasks': 'needs_task-variety',
        'Visual workflow': 'needs_visual_management',
        'Low interruptions': 'needs_focus_time',
        'Collaborative team': 'needs_teamwork',
        'Quiet work blocks': 'needs_quiet_env'
    }

    # Support needs mapping
    SUPPORT_NEEDS = {
        'Written instructions': 'supports_documentation',
        'Calendar reminders': 'supports_scheduling',
        'Checklists': 'supports_task_management',
        'Regular check-ins': 'supports_accountability',
        'Flexible start time': 'supports_schedule_flexibility',
        'Noise-reduced space': 'supports_quiet_env',
        'Task batching': 'supports_focus_blocks',
        'Break prompts': 'supports_breaks'
    }

    # Energy patterns mapping
    ENERGY_PATTERNS = {
        'Best with routine': 'energy_routine',
        'Best with variety': 'energy_variety',
        'Best with clear deadlines': 'energy_deadline_driven',
        'Best with flexible pace': 'energy_flexible',
        'Best with short focus sprints': 'energy_sprints',
        'Best with frequent breaks': 'energy_breaks_needed',
        'Best with visual task boards': 'energy_visual',
        'Best with one task at a time': 'energy_sequential',
        'Best in quieter settings': 'energy_quiet',
        'Best with accountability': 'energy_presence',
        'Best with body-doubling/accountability': 'energy_presence',  # legacy / alternate wording
        'Best with morning deep work': 'energy_morning',
        'Best with afternoon deep work': 'energy_afternoon'
    }

    # Role duration confidence boost
    ROLE_DURATION_CONFIDENCE = {
        'Internship': 0.7,
        '6 months': 0.85,
        '1-2 years': 1.0
    }

    # Stronger negative adjustments (reduces 50–70 soft clustering on poor fits)
    PENALTY_STRENGTH = 1.28
    # Baseline blend when no ML prob (documentation / trace only; actual blend is uncertainty-weighted).
    ML_BLEND_WEIGHT_BASE = 0.40
    RULE_BLEND_WEIGHT_BASE = 0.60
    # Compress rule_score toward neutral before blending when ML is active (rules = tilt, not driver).
    RULE_BLEND_COMPRESSION = 0.42

    def __init__(self, training_data: Optional[Dict] = None):
        """
        Initialize with optional training data from wrangled ADHD dataset.
        
        Args:
            training_data: Dict with statistics from ADHD training data
                {
                    'adhd_profile_distribution': {...},
                    'severity_distribution': {...},
                    'mean_inattention': float,
                    'mean_hyperactivity': float,
                    ...
                }
        """
        self.training_data = training_data or {}

    @staticmethod
    def effective_ml_rule_blend_weights(ml_prob: Optional[float]) -> Tuple[float, float]:
        """
        Uncertainty-weighted ML share: 0.30 when p≈0.5 (uncertain), up to 0.60 at extremes.
        Complement goes to the compressed rule tilt until we have calibrated production labels.
        """
        if ml_prob is None:
            return JobScoreModelV2.ML_BLEND_WEIGHT_BASE, JobScoreModelV2.RULE_BLEND_WEIGHT_BASE
        p = max(0.0, min(1.0, float(ml_prob)))
        dist = abs(p - 0.5) * 2.0
        ml_w = 0.30 + 0.30 * dist
        ml_w = max(0.30, min(0.60, ml_w))
        return ml_w, 1.0 - ml_w

    def _amplify_adjustment(self, delta: float) -> float:
        """Apply extra weight to penalties (negative adjustments)."""
        if delta < 0:
            return delta * self.PENALTY_STRENGTH
        return delta

    @staticmethod
    def _spread_score_distribution(x: float) -> float:
        """
        Nonlinear map to widen the score range: compress the crowded 50–70 band
        and push more mass toward the tails after hybrid blending.
        """
        x = max(0.0, min(100.0, x))
        u = x / 100.0
        eps = 1e-5
        u = eps + (1.0 - 2.0 * eps) * u
        logit = math.log(u / (1.0 - u))
        logit *= 1.15
        u2 = 1.0 / (1.0 + math.exp(-logit))
        u2 = 0.5 + 0.55 * math.tanh(2.4 * (u2 - 0.5))
        return max(0.0, min(100.0, u2 * 100.0))

    def _normalize_skill(self, value: str) -> str:
        """Normalize skill text so Gemini wording variations map better."""
        text = re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()
        aliases = {
            "js": "javascript",
            "node js": "nodejs",
            "node": "nodejs",
            "ui ux": "ux",
            "ux ui": "ux",
            "version control": "git",
            "graphic design": "design",
        }
        text = aliases.get(text, text)
        return apply_skill_equivalence(text)

    def _skill_tokens(self, value: str) -> set:
        normalized = self._normalize_skill(value)
        tokens = set(normalized.split())
        return {t for t in tokens if len(t) > 2}

    def _skills_overlap_legacy(self, user_skill: str, job_skill: str) -> bool:
        """Token overlap baseline (used inside richer matcher)."""
        u = self._normalize_skill(user_skill)
        j = self._normalize_skill(job_skill)
        if not u or not j:
            return False
        if u == j:
            return True
        if u in j or j in u:
            return True
        ut = self._skill_tokens(u)
        jt = self._skill_tokens(j)
        if not ut or not jt:
            return False
        overlap = len(ut & jt) / max(1, min(len(ut), len(jt)))
        return overlap >= 0.6

    def _skills_overlap(self, user_skill: str, job_skill: str) -> bool:
        """Clusters + fuzzy match (rapidfuzz when installed)."""
        return skills_overlap_enhanced(
            user_skill,
            job_skill,
            normalize=self._normalize_skill,
            base_overlap=self._skills_overlap_legacy,
        )
        
    def score_job_match(
        self,
        user_questionnaire: Dict,
        occupation: Dict,
        job_fit_features: Optional[Dict] = None,
        verbose: bool = False
    ) -> Dict:
        """
        Score how well a job matches user's ADHD profile and preferences.
        
        Args:
            user_questionnaire: User's questionnaire responses
                {
                    'adhd_profile_type': str,  # from type classification
                    'work_preferences': List[str],  # up to 2
                    'support_needs': List[str],  # up to 2
                    'energy_patterns': List[str],  # up to 2
                    'primary_role': str,  # IT/software role
                    'role_duration': str,  # Internship, 6 months, 1-2 years
                    'skills': List[str]  # user's skills
                }
            occupation: Job occupation data
                {
                    'occupation_id': int,
                    'occupation_name': str,
                    'anzsco_code': str,
                    'adhd_friendliness_score': float,  # 0-100 from training
                    'work_complexity': str,
                    'implied_skills': List[str],
                    'typical_hours_per_week': int,
                    ...
                }
            verbose: Print scoring details
        
        Returns:
            {
                'score': float (0-100),
                'recommendation': str,
                'reasoning': str,
                'factor_breakdown': Dict,
                'key_strengths': List[str],
                'key_challenges': List[str],
                'suggested_accommodations': List[str],
                'match_confidence': float (0-1)
            }
        """
        
        score = 50.0  # Neutral baseline
        factors = {}

        raw_fit = job_fit_features if isinstance(job_fit_features, dict) else {}
        jfit_raw = normalize_gemini_job_fit(raw_fit if raw_fit else None)
        use_gemini_fit = len(raw_fit) > 0
        jfit: Dict = {}
        soft_skill_dump: Optional[Dict] = None
        parsed_soft_model: Optional[SoftSkillRequirements] = None
        if use_gemini_fit:
            jfit = apply_job_fit_defaults(jfit_raw)
            if isinstance(raw_fit, dict) and raw_fit.get("soft_skill_requirements"):
                try:
                    parsed_soft_model = SoftSkillRequirements.model_validate(raw_fit["soft_skill_requirements"])
                    soft_skill_dump = {
                        k: v for k, v in parsed_soft_model.model_dump().items() if v is not None
                    }
                except Exception:
                    logger.debug("soft_skill_requirements validation failed", exc_info=True)
                    parsed_soft_model = None
                    soft_skill_dump = None
            factors["gemini_job_fit"] = {
                "normalized": jfit,
                "before_defaults": jfit_raw,
                "defaults_note": "Sparse posting: neutral defaults applied only where signals were missing.",
                "source": "structured_job_fit",
                "soft_skill_requirements": soft_skill_dump,
            }
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 1. ADHD PROFILE TYPE FIT (±20 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        adhd_type = user_questionnaire.get('adhd_profile_type', 'combined')
        adhd_fit, adhd_reasoning = self._score_adhd_type_fit(adhd_type, occupation)
        adhd_adj = self._amplify_adjustment(adhd_fit)
        score += adhd_adj
        factors['adhd_type'] = {
            'adjustment': adhd_adj,
            'reasoning': adhd_reasoning,
            'max_points': 20
        }
        
        if verbose:
            print(f"[ADHD Type] {adhd_adj:+.0f} points (amplified penalty if negative): {adhd_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 2. WORK PREFERENCES FIT (±15 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        work_prefs = user_questionnaire.get('work_preferences', [])
        if use_gemini_fit:
            work_fit, work_reasoning = _rate_prefs_work_gemini(work_prefs, jfit)
        else:
            work_fit, work_reasoning = self._score_work_preferences_keywords(work_prefs, occupation)
        work_adj = self._amplify_adjustment(work_fit)
        score += work_adj
        factors['work_preferences'] = {
            'adjustment': work_adj,
            'reasoning': work_reasoning,
            'selected': work_prefs,
            'max_points': 15
        }
        
        if verbose:
            print(f"[Work Preferences] {work_adj:+.0f} points: {work_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 3. SUPPORT NEEDS FIT (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        support_needs = user_questionnaire.get('support_needs', [])
        if use_gemini_fit:
            support_fit, support_reasoning = _rate_support_gemini(support_needs, jfit)
        else:
            support_fit, support_reasoning = self._score_support_needs_keywords(support_needs, occupation)
        support_adj = self._amplify_adjustment(support_fit)
        score += support_adj
        factors['support_needs'] = {
            'adjustment': support_adj,
            'reasoning': support_reasoning,
            'selected': support_needs,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Support Needs] {support_adj:+.0f} points: {support_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 4. ENERGY PATTERNS FIT (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        energy_patterns = user_questionnaire.get('energy_patterns', [])
        if use_gemini_fit:
            energy_fit, energy_reasoning = _rate_energy_gemini(energy_patterns, jfit)
        else:
            energy_fit, energy_reasoning = self._score_energy_patterns_keywords(energy_patterns, occupation)
        energy_adj = self._amplify_adjustment(energy_fit)
        score += energy_adj
        factors['energy_patterns'] = {
            'adjustment': energy_adj,
            'reasoning': energy_reasoning,
            'selected': energy_patterns,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Energy Patterns] {energy_adj:+.0f} points: {energy_reasoning}")
        
        user_soft_inferred = self._infer_user_soft_skills(work_prefs, support_needs, energy_patterns)
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 5. ROLE EXPERIENCE & CONFIDENCE (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        primary_role = user_questionnaire.get('primary_role', '')
        duration = user_questionnaire.get('role_duration', 'Internship')
        user_skills_rx = user_questionnaire.get('skills', [])
        job_skills_rx = occupation.get('implied_skills', [])
        role_fit, role_reasoning = self._score_role_experience(duration, user_skills_rx, job_skills_rx)
        role_adj = self._amplify_adjustment(role_fit)
        score += role_adj
        factors['role_experience'] = {
            'adjustment': role_adj,
            'reasoning': role_reasoning,
            'role': primary_role,
            'duration': duration,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Role Experience] {role_adj:+.0f} points: {role_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 6. SKILL MATCH (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        user_skills = user_questionnaire.get('skills', [])
        job_skills = occupation.get('implied_skills', [])
        skill_fit, skill_reasoning = self._score_skill_match(user_skills, job_skills)
        skill_adj = self._amplify_adjustment(skill_fit)
        score += skill_adj
        factors['skills'] = {
            'adjustment': skill_adj,
            'reasoning': skill_reasoning,
            'user_skills': user_skills,
            'job_skills': job_skills,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Skills] {skill_adj:+.0f} points: {skill_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 7. JOB COMPLEXITY MATCH (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        if use_gemini_fit:
            complexity_fit, complexity_reasoning = rate_complexity_gemini(adhd_type, jfit)
        else:
            complexity_fit, complexity_reasoning = self._score_complexity_match_keywords(
                adhd_type, work_prefs, occupation
            )
        complexity_adj = self._amplify_adjustment(complexity_fit)
        score += complexity_adj
        factors['complexity'] = {
            'adjustment': complexity_adj,
            'reasoning': complexity_reasoning,
            'job_complexity': occupation.get('work_complexity', 'Medium'),
            'max_points': 10
        }
        
        if verbose:
            print(f"[Complexity] {complexity_adj:+.0f} points: {complexity_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 8. SOFT SKILLS vs JOB DEMANDS (±8 points, Gemini soft_skill_requirements)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        soft_fit = 0.0
        soft_reasoning = "No job soft-skill demand signal from posting"
        if use_gemini_fit and parsed_soft_model is not None:
            demands = {
                k: _normalize_soft_demand_level(getattr(parsed_soft_model, k, None))
                for k in _SOFT_SKILL_KEYS
            }
            soft_fit, soft_reasoning = self._score_soft_skills_vs_demands(demands, user_soft_inferred)
        soft_adj = self._amplify_adjustment(soft_fit)
        score += soft_adj
        factors["soft_skills"] = {
            "adjustment": soft_adj,
            "reasoning": soft_reasoning,
            "max_points": 8,
            "user_inferred": user_soft_inferred if use_gemini_fit else {},
        }
        
        if verbose:
            print(f"[Soft skills] {soft_adj:+.0f} points: {soft_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # FINAL SCORE & INTERPRETATION
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # If skill evidence is strong, soften stacked rule-layer penalties.
        non_skill_penalty = (
            min(0.0, adhd_fit)
            + min(0.0, work_fit)
            + min(0.0, support_fit)
            + min(0.0, energy_fit)
            + min(0.0, role_fit)
            + min(0.0, complexity_fit)
            + min(0.0, soft_fit)
        )
        skill_stabilizer = 0.0
        if skill_fit >= 10 and non_skill_penalty <= -15:
            skill_stabilizer = min(10.0, abs(non_skill_penalty) * 0.35)
            score += skill_stabilizer
            factors["skills"]["stabilizer"] = round(skill_stabilizer, 2)

        rule_score = max(0.0, min(100.0, score))
        logger.info(
            "[JobScoreModelV2 DEBUG] occupation_id=%s Step rule_score (0–100 accumulated rule layer)=%.4f",
            occupation.get("occupation_id"),
            rule_score,
        )

        ml_prob = None
        ml_source = ""
        safe_ml_debug: Dict = {}

        tsk_prob, tsk_dbg = predict_task_classifier_prob(user_questionnaire, occupation)
        if isinstance(tsk_dbg, dict):
            safe_ml_debug["task_classifier"] = tsk_dbg
        if tsk_prob is not None:
            ml_prob = tsk_prob
            ml_source = "task_success_classifier"
        else:
            if isinstance(tsk_dbg, dict) and tsk_dbg.get("fallback_reason"):
                safe_ml_debug["task_classifier_fallback_reason"] = tsk_dbg.get("fallback_reason")
            if isinstance(tsk_dbg, dict) and tsk_dbg.get("error"):
                safe_ml_debug["task_classifier_error"] = tsk_dbg.get("error")
            ml_prob, ml_debug = predict_ml_success_probability(user_questionnaire, occupation)
            ml_source = "clinical_dataset_rf"
            safe_ml_debug["used_fallback"] = "clinical_dataset_rf"
            logger.warning(
                "[JobScoreModelV2] task_success_classifier unavailable — using clinical_dataset_rf. Debug=%s",
                {k: safe_ml_debug.get(k) for k in ("task_classifier_error", "task_classifier_fallback_reason") if safe_ml_debug.get(k)},
            )
            if isinstance(ml_debug, dict):
                if "diagnosis_class_used" in ml_debug:
                    safe_ml_debug["diagnosis_class_used"] = ml_debug["diagnosis_class_used"]
                if "error" in ml_debug:
                    safe_ml_debug["clinical_rf_error"] = ml_debug["error"]
                if "top_features_by_importance" in ml_debug:
                    safe_ml_debug["top_features_by_importance"] = ml_debug["top_features_by_importance"]
                if "raw_prediction_pre_clamp" in ml_debug:
                    safe_ml_debug["raw_prediction_pre_clamp"] = ml_debug["raw_prediction_pre_clamp"]

        blend_ml_desc = (
            "task-success RF (offline training + profile templates)"
            if ml_source == "task_success_classifier"
            else "clinical ADHD RF (fallback)"
        )

        ml_layer: Dict = {
            "job_success_probability": round(ml_prob, 4) if ml_prob is not None else None,
            "ml_score_0_100": None,
            "rule_score_0_100": round(rule_score, 2),
            "ml_source": ml_source or None,
            "pre_spread_blended": None,
            "rule_penalty_strength": self.PENALTY_STRENGTH,
            "rule_compression": self.RULE_BLEND_COMPRESSION,
            "ml_debug": safe_ml_debug,
        }

        if ml_prob is not None:
            ml_100 = ml_score_0_100(ml_prob)
            ml_layer["ml_score_0_100"] = ml_100
            rule_tilt = 50.0 + (rule_score - 50.0) * self.RULE_BLEND_COMPRESSION
            ml_layer["rule_tilt_0_100"] = round(rule_tilt, 2)
            ml_w_eff, rule_w_eff = self.effective_ml_rule_blend_weights(ml_prob)
            blended = ml_w_eff * ml_100 + rule_w_eff * rule_tilt
            ml_layer["ml_blend_weight_effective"] = round(ml_w_eff, 4)
            ml_layer["rule_blend_weight_effective"] = round(rule_w_eff, 4)
            ml_layer["blend"] = (
                f"{ml_w_eff:.0%} ML ({blend_ml_desc}) + {rule_w_eff:.0%} compressed rule tilt "
                f"(|p−0.5| weights ML 30–60% until retrain)"
            )
            logger.info(
                "[JobScoreModelV2 DEBUG] blend_constants ml_w_effective=%.4f rule_w_effective=%.4f "
                "RULE_BLEND_COMPRESSION=%.4f (rule tilt pulls rule_score toward 50 before mixing)",
                ml_w_eff,
                rule_w_eff,
                self.RULE_BLEND_COMPRESSION,
            )
            logger.info(
                "[JobScoreModelV2 DEBUG] ml_source=%s ml_probability_raw=%s ml_score_0_100=%.4f",
                ml_source,
                round(ml_prob, 6) if ml_prob is not None else None,
                ml_100,
            )
            logger.info(
                "[JobScoreModelV2 DEBUG] rule_tilt = 50 + (rule_score - 50) * %.4f => %.4f",
                self.RULE_BLEND_COMPRESSION,
                rule_tilt,
            )
            logger.info(
                "[JobScoreModelV2 DEBUG] blended_linear_pre_spread = %.4f * %.4f + %.4f * %.4f = %.6f "
                "(raw for debugging; rule arm uses rule_tilt)",
                ml_w_eff,
                ml_100,
                rule_w_eff,
                rule_tilt,
                blended,
            )
            logger.info(
                "[JobScoreModelV2] raw_blended_linear_pre_spread=%.6f ml_w=%.4f rule_w=%.4f ml_p=%s",
                blended,
                ml_w_eff,
                rule_w_eff,
                round(ml_prob, 6),
            )
        else:
            blended = rule_score
            ml_layer["blend"] = "rules only (no ML probability)"
            ml_layer["note"] = "ML layer unavailable (train artifacts or templates missing); rules only."
            logger.info(
                "[JobScoreModelV2 DEBUG] ML unavailable — blended_pre_spread = rule_score = %.4f",
                blended,
            )

        ml_layer["pre_spread_blended"] = round(blended, 2)
        spread_raw = self._spread_score_distribution(blended)
        ml_layer["post_spread_pre_cap"] = round(spread_raw, 2)
        # Relaxed display clamp for debugging (was [10, 90]).
        cap_lo, cap_hi = 0.0, 100.0
        final_score = max(cap_lo, min(cap_hi, spread_raw))
        ml_layer["score_display_cap"] = [cap_lo, cap_hi]
        ml_layer["display_clamp_note"] = "Relaxed to [0,100] for debugging (was [10,90])"
        if spread_raw != final_score:
            ml_layer["score_was_clamped"] = True

        logger.info(
            "[JobScoreModelV2 DEBUG] post_nonlinear_spread in=%.4f out=%.4f | final_after_[0,100]_cap=%.4f",
            round(blended, 4),
            round(spread_raw, 4),
            round(final_score, 4),
        )

        # ── Transparent blend audit (API + logs): documents actual weights / steps ─────────
        blend_trace: Dict = {
            "formula_notes": (
                "blended_pre_spread = ml_w_effective * ml_score_0_100 + rule_w_effective * rule_tilt; "
                "ml_w in [0.30,0.60] from |ml_prob−0.5| (uncertain ⇒ favor rules); "
                "rule_tilt = 50 + (rule_score - 50) * RULE_BLEND_COMPRESSION; "
                "then nonlinear _spread_score_distribution(blended); "
                f"then clamp to [{cap_lo}, {cap_hi}] for debugging."
            ),
            "constants": {
                "ML_BLEND_WEIGHT_BASE": self.ML_BLEND_WEIGHT_BASE,
                "RULE_BLEND_WEIGHT_BASE": self.RULE_BLEND_WEIGHT_BASE,
                "ml_blend_weight_effective": ml_layer.get("ml_blend_weight_effective"),
                "rule_blend_weight_effective": ml_layer.get("rule_blend_weight_effective"),
                "RULE_BLEND_COMPRESSION": self.RULE_BLEND_COMPRESSION,
                "PENALTY_STRENGTH": self.PENALTY_STRENGTH,
            },
            "rule_score_0_100": round(rule_score, 4),
            "ml_source": ml_source or None,
            "ml_probability_raw": round(ml_prob, 6) if ml_prob is not None else None,
            "ml_score_0_100": ml_layer.get("ml_score_0_100"),
            "rule_tilt_0_100": ml_layer.get("rule_tilt_0_100"),
            "blended_before_spread": round(blended, 4),
            "post_spread_before_display_cap": round(spread_raw, 4),
            "display_cap": [cap_lo, cap_hi],
            "final_score_after_cap": round(final_score, 4),
            "score_was_clamped_to_cap": bool(spread_raw != final_score),
        }
        ml_layer["blend_trace"] = blend_trace

        occ_id = occupation.get("occupation_id")
        if ml_prob is not None:
            ml_100_v = ml_layer.get("ml_score_0_100")
            rt_v = ml_layer.get("rule_tilt_0_100")
            mw = ml_layer.get("ml_blend_weight_effective")
            rw = ml_layer.get("rule_blend_weight_effective")
            logger.info(
                "[JobScoreModelV2 blend audit] occupation_id=%s ml_source=%s\n"
                "  rule_score (0-100, accumulated rule layer): %s\n"
                "  ml_probability_raw: %s\n"
                "  ml_score_0_100 (prob scaled to 0-100): %s\n"
                "  rule_tilt = 50 + (rule_score - 50) * %.4f => %s\n"
                "  blended_pre_spread = %.4f * %s + %.4f * %s = %s\n"
                "  post _spread_score_distribution: %s\n"
                "  final after clamp [%s,%s]: %s",
                occ_id,
                ml_source,
                round(rule_score, 2),
                round(ml_prob, 6),
                ml_100_v,
                self.RULE_BLEND_COMPRESSION,
                rt_v,
                mw,
                ml_100_v,
                rw,
                rt_v,
                round(blended, 4),
                round(spread_raw, 4),
                cap_lo,
                cap_hi,
                round(final_score, 4),
            )
        else:
            logger.info(
                "[JobScoreModelV2 blend audit] occupation_id=%s ML unavailable — rules only\n"
                "  rule_score (0-100): %s\n"
                "  blended_pre_spread (= rule_score): %s\n"
                "  post _spread_score_distribution: %s\n"
                "  final after clamp [%s,%s]: %s",
                occ_id,
                round(rule_score, 2),
                round(blended, 4),
                round(spread_raw, 4),
                cap_lo,
                cap_hi,
                round(final_score, 4),
            )
        
        # Generate recommendations
        recommendation, strengths, challenges, accommodations = \
            self._generate_recommendations(final_score, adhd_type, occupation, user_questionnaire)
        
        # Calculate confidence (how well factors align)
        confidence = self._calculate_confidence(factors)
        
        reasoning = self._build_detailed_reasoning(
            final_score, factors, occupation, user_questionnaire, ml_layer
        )
        
        return {
            'score': round(final_score, 1),
            'recommendation': recommendation,
            'reasoning': reasoning,
            'factor_breakdown': factors,
            'key_strengths': strengths,
            'key_challenges': challenges,
            'suggested_accommodations': accommodations,
            'match_confidence': round(confidence, 2),
            'ml_layer': ml_layer,
            'occupation': {
                'name': occupation.get('occupation_name', ''),
                'anzsco_code': occupation.get('anzsco_code', ''),
                'complexity': occupation.get('work_complexity', 'Unknown')
            }
        }

    def _infer_user_soft_skills(
        self,
        work_prefs: List[str],
        support_needs: List[str],
        energy_patterns: List[str],
    ) -> Dict[str, str]:
        """
        Infer low | medium | high soft-skill affinity from work preferences,
        support needs, and energy patterns (questionnaire).
        """
        wp = set(work_prefs or [])
        sn = set(support_needs or [])
        ep = set(energy_patterns or [])

        if "Collaborative team" in wp:
            communication = "high"
        else:
            communication = "medium"

        if "Best with flexible pace" in ep and "Best with clear deadlines" not in ep:
            time_management = "low"
        elif (
            "Best with clear deadlines" in ep
            or "Best with routine" in ep
            or bool({"Calendar reminders", "Checklists", "Regular check-ins"} & sn)
        ):
            time_management = "high"
        elif "Task batching" in sn:
            time_management = "medium"
        else:
            time_management = "medium"

        if "Clear priorities" in wp and (
            "Best with clear deadlines" in ep or "Best with one task at a time" in ep
        ):
            problem_solving = "high"
        elif "Best with variety" in ep:
            problem_solving = "medium"
        else:
            problem_solving = "medium"

        if "Regular check-ins" in sn and "Collaborative team" in wp:
            leadership = "high"
        elif "Collaborative team" in wp:
            leadership = "medium"
        else:
            leadership = "medium"

        if "Collaborative team" in wp:
            teamwork = "high"
        elif "Quiet work blocks" in wp and "Collaborative team" not in wp:
            teamwork = "low"
        else:
            teamwork = "medium"

        if "Best with variety" in ep:
            adaptability = "high"
        elif "Best with routine" in ep and "Best with variety" not in ep:
            adaptability = "low"
        else:
            adaptability = "medium"

        if (
            "Best with accountability" in ep
            or "Best with body-doubling/accountability" in ep
            or "Regular check-ins" in sn
        ):
            self_motivation = "high"
        elif "Best with flexible pace" in ep and "Best with clear deadlines" not in ep:
            self_motivation = "low"
        elif "Best with clear deadlines" in ep:
            self_motivation = "high"
        else:
            self_motivation = "medium"

        return {
            "communication": communication,
            "time_management": time_management,
            "problem_solving": problem_solving,
            "leadership": leadership,
            "teamwork": teamwork,
            "adaptability": adaptability,
            "self_motivation": self_motivation,
        }

    def _score_soft_skills_vs_demands(
        self,
        demands: Dict[str, Optional[str]],
        user_soft: Dict[str, str],
    ) -> Tuple[float, str]:
        """
        Compare job soft-skill demand (Gemini) to inferred user levels.
        Raw sum is capped to [-8, 8] before penalty amplification.
        """
        deltas: List[float] = []
        notes: List[str] = []
        for key in _SOFT_SKILL_KEYS:
            dlevel = demands.get(key)
            if not dlevel:
                continue
            dn = _soft_level_to_num(dlevel)
            if dn is None:
                continue
            ulevel = user_soft.get(key, "medium")
            un = _soft_level_to_num(ulevel)
            if un is None:
                un = 1
            gap = un - dn
            if gap >= 1:
                w = 2.0
            elif gap == 0:
                w = 0.8
            elif gap == -1:
                w = -1.5
            else:
                w = -2.4
            deltas.append(w)
            notes.append(f"{key.replace('_', ' ')} job={dlevel} you={ulevel} ({w:+.1f})")

        if not deltas:
            return 0.0, "No usable soft-skill demand levels from posting"

        raw = sum(deltas)
        capped = max(-8.0, min(8.0, raw))
        reason = "; ".join(notes[:8])
        if len(notes) > 8:
            reason += " …"
        return capped, reason

    def _score_adhd_type_fit(self, adhd_type: str, occupation: Dict) -> Tuple[float, str]:
        """Score how well job suits this ADHD type."""
        friendliness = occupation.get('adhd_friendliness_score', 50)
        complexity = occupation.get('work_complexity', 'Medium').lower()
        
        if adhd_type == 'inattentive':
            if friendliness >= 70:
                return +15, "High structure & routine (excellent for inattentive type)"
            elif friendliness >= 50:
                return +5, "Moderate structure"
            else:
                return -15, "Chaotic environment (challenging for inattentive profile)"
        
        elif adhd_type == 'hyperactive-impulsive':
            if friendliness <= 40 and complexity == 'high':
                return +10, "Fast-paced & varied (stimulating for hyperactive type)"
            elif friendliness >= 70:
                return -15, "Too routine (may feel understimulating)"
            else:
                return 0, "Mixed pace"
        
        else:  # combined
            if 45 <= friendliness <= 65:
                return +10, "Balanced structure & flexibility"
            else:
                return 0, "Requires adaptation"
    
    def _score_work_preferences_keywords(self, prefs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score work preferences using occupation metadata + implied skills (no job-title substring rules)."""
        if not prefs:
            return 0.0, "No preferences specified"

        traits = fallback_job_trait_map(occupation)
        pref_keys = [self.WORK_PREFERENCES.get(p, "") for p in prefs]
        if not any(pref_keys):
            return 0.0, "Unable to map preferences"

        match_rate = trait_match_rate(prefs, self.WORK_PREFERENCES, traits)

        if match_rate >= 0.8:
            return +15, "Occupation signals align with your work preferences"
        if match_rate >= 0.5:
            return +5, "Partial alignment with work preferences (from role metadata)"
        if match_rate >= 0.2:
            return -5, "Some work style mismatches (from role metadata)"
        return -15, "Limited alignment with work preferences (from role metadata)"
    
    def _score_support_needs_keywords(self, needs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score supports using occupation metadata + implied skills (no title substring rules)."""
        if not needs:
            return 0.0, "No specific supports needed"

        traits = fallback_job_trait_map(occupation)
        need_keys = [self.SUPPORT_NEEDS.get(n, "") for n in needs]
        if not any(need_keys):
            return 0.0, "Unable to map supports"

        match_rate = trait_match_rate(needs, self.SUPPORT_NEEDS, traits)

        if match_rate >= 0.8:
            return +10, "Role metadata suggests your needed supports may be present"
        if match_rate >= 0.5:
            return +5, "Some supports may be plausible from role signals"
        if match_rate == 0:
            return -5, "Limited support signals in occupation data"
        return 0, "Mixed support signals from occupation data"
    
    def _score_energy_patterns_keywords(self, patterns: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score energy patterns using occupation metadata + implied skills (no title substring rules)."""
        if not patterns:
            return 0.0, "No energy patterns specified"

        traits = fallback_job_trait_map(occupation)
        pattern_keys = [self.ENERGY_PATTERNS.get(p, "") for p in patterns]
        if not any(pattern_keys):
            return 0.0, "Unable to map energy patterns"

        match_rate = trait_match_rate(patterns, self.ENERGY_PATTERNS, traits)

        if match_rate >= 1.0:
            return +10, "Occupation signals align with your energy patterns"
        if match_rate >= 0.5:
            return +5, "Partial alignment on energy/pace (from role metadata)"
        return -10, "Weak alignment with your energy patterns (from role metadata)"
    
    def _score_role_experience(
        self,
        duration: str,
        user_skills: List[str],
        job_skills: List[str],
    ) -> Tuple[float, str]:
        """Role alignment from user vs occupation skill overlap only (no job title)."""
        duration_mult = self.ROLE_DURATION_CONFIDENCE.get(duration, 0.7)
        base = (duration_mult - 0.7) * 10

        user_norm = [self._normalize_skill(s) for s in user_skills if str(s or "").strip()]
        job_norm = [self._normalize_skill(s) for s in job_skills if str(s or "").strip()]
        if not user_norm or not job_norm:
            return 0.0, "Skill overlap unavailable—add your skills and ensure occupation skills exist"

        matched_user = sum(
            1 for us in user_norm if any(self._skills_overlap(us, js) for js in job_norm)
        )
        overlap_rate = matched_user / len(user_norm)

        if overlap_rate >= 0.5:
            confidence_mult = 1.0
            tag = "Your skills align well with this occupation"
        elif overlap_rate >= 0.25:
            confidence_mult = 0.85
            tag = "Moderate skill overlap with this occupation"
        else:
            confidence_mult = 0.65
            tag = "Limited overlap with this occupation's skill profile"

        adjustment = base * confidence_mult
        return adjustment, f"{tag} ({int(round(overlap_rate * 100))}% of your skills match); duration: {duration}"
    
    def _score_skill_match(self, user_skills: List[str], job_skills: List[str]) -> Tuple[float, str]:
        """Score skill alignment."""
        if not job_skills:
            return 0.0, "No job skills specified"
        
        if not user_skills:
            return -5, "No user skills provided"
        
        user_norm = [self._normalize_skill(s) for s in user_skills if str(s or "").strip()]
        job_norm = [self._normalize_skill(s) for s in job_skills if str(s or "").strip()]
        if not job_norm:
            return 0.0, "No mappable job skills specified"

        strong_matches = 0
        covered_user = set()
        for js in job_norm:
            matched_idx = None
            for idx, us in enumerate(user_norm):
                if idx in covered_user:
                    continue
                if self._skills_overlap(us, js):
                    matched_idx = idx
                    break
            if matched_idx is not None:
                strong_matches += 1
                covered_user.add(matched_idx)

        n_job = len(job_norm)
        n_user = len(user_norm)
        # Job-only rate punishes long JD skill lists; blend with how much of the user's
        # skill set is represented (per product spec).
        job_coverage = strong_matches / n_job
        user_coverage = len(covered_user) / n_user
        weighted_match_rate = 0.7 * job_coverage + 0.3 * user_coverage
        variability_bonus = 2.0 if len(job_norm) >= 6 else 0.0

        pct = int(round(weighted_match_rate * 100))
        if weighted_match_rate >= 0.75:
            return +12 + variability_bonus, f"Strong skill match ({pct}% weighted)"
        if weighted_match_rate >= 0.5:
            return +8 + (variability_bonus * 0.5), f"Good skill match ({pct}% weighted)"
        if weighted_match_rate >= 0.3:
            return +3, f"Partial skill match ({pct}% weighted)"
        if weighted_match_rate > 0:
            return 0, "Some transferable skills"
        return -4, "Limited skill overlap"
    
    def _score_complexity_match_keywords(self, adhd_type: str, work_prefs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score appropriateness of job complexity (DB occupation heuristic)."""
        complexity = occupation.get('work_complexity', 'Medium').lower()
        
        # Inattentive prefer low-medium, Hyperactive prefer high
        if adhd_type == 'inattentive':
            if complexity in ['low', 'medium']:
                return +5, "Complexity level manageable for inattentive profile"
            else:
                return -10, "High complexity may overwhelm inattentive focus"
        
        elif adhd_type == 'hyperactive-impulsive':
            if complexity in ['high', 'medium']:
                return +5, "Sufficient complexity for stimulation"
            else:
                return -5, "Low complexity may feel understimulating"
        
        else:
            return 0, "Complexity is workable with adaptation"
    
    def _generate_recommendations(self, score: float, adhd_type: str, occupation: Dict, user_data: Dict) -> Tuple[str, List[str], List[str], List[str]]:
        """Generate recommendation text and supporting lists."""
        occ_name = occupation.get('occupation_name', 'this role')
        
        if score >= 75:
            rec = f"Excellent fit! {occ_name} strongly aligns with your ADHD profile and preferences."
        elif score >= 60:
            rec = f"Good fit. {occ_name} could be a strong choice with your ADHD strengths in mind."
        elif score >= 50:
            rec = f"Reasonable fit. {occ_name} is possible with some ADHD-aware strategies."
        elif score >= 35:
            rec = f"Challenging fit. {occ_name} may require significant accommodations to thrive."
        else:
            rec = f"Poor fit. Consider roles with higher match scores for better alignment."
        
        # Generate strengths based on ADHD type
        profile_data = self.ADHD_PROFILE_TYPES.get(adhd_type, {})
        strengths = profile_data.get('strengths', [])
        challenges = profile_data.get('challenges', [])
        needs = profile_data.get('needs', [])
        
        # Suggested accommodations based on support needs
        accommodations = user_data.get('support_needs', [])
        if not accommodations:
            accommodations = needs[:2]  # Use profile needs if not specified
        
        return rec, strengths, challenges, accommodations
    
    def _calculate_confidence(self, factors: Dict) -> float:
        """Calculate overall match confidence (0-1)."""
        total_points = sum(f.get('max_points', 0) for f in factors.values())
        achieved_points = sum(f.get('adjustment', 0) for f in factors.values())
        
        if total_points == 0:
            return 0.5
        
        return 0.5 + (achieved_points / (total_points * 2)) * 0.5  # 0.5-1.0 range
    
    def _build_detailed_reasoning(
        self,
        score: float,
        factors: Dict,
        occupation: Dict,
        user_data: Dict,
        ml_layer: Optional[Dict] = None,
    ) -> str:
        """Build detailed explanation of score."""
        lines = [
            f"Your match score for {occupation.get('occupation_name', 'this role')} is {score:.0f}/100.",
            "",
        ]
        if ml_layer:
            ps = ml_layer.get("pre_spread_blended")
            rs = ml_layer.get("rule_score_0_100")
            ms = ml_layer.get("ml_score_0_100")
            if ml_layer.get("job_success_probability") is not None and ms is not None:
                mw = ml_layer.get("ml_blend_weight_effective")
                rw = ml_layer.get("rule_blend_weight_effective")
                mw_s = f"{float(mw):.0%}" if mw is not None else f"{self.ML_BLEND_WEIGHT_BASE:.0%}"
                rw_s = f"{float(rw):.0%}" if rw is not None else f"{self.RULE_BLEND_WEIGHT_BASE:.0%}"
                lines.append(
                    f"Hybrid model: ≈{mw_s} ML job-success estimate "
                    f"(trained on ADHD clinical dataset + synthetic job scenarios) + "
                    f"≈{rw_s} explainable rule factors (weight rises when ML probability is far from 0.5). "
                    f"Before spread shaping: ML ≈ {ms:.0f}/100, rules ≈ {rs:.0f}/100, blended ≈ {ps}/100."
                )
            else:
                lines.append(
                    f"Rule-only score (approx. {rs:.0f}/100 before shaping); ML layer was unavailable."
                )
            lines.append("")
        lines.append("Score Breakdown (rule layer — penalties amplified for mismatches):")
        
        for factor_name, factor_data in factors.items():
            adj = factor_data.get('adjustment', 0)
            reason = factor_data.get('reasoning', '')
            sign = "+" if adj >= 0 else ""
            lines.append(f"  {factor_name.replace('_', ' ').title()}: {sign}{adj:.0f} – {reason}")
        
        adhd_type = user_data.get('adhd_profile_type', 'combined')
        profile_info = self.ADHD_PROFILE_TYPES.get(adhd_type, {})
        
        lines.extend([
            "",
            f"Your ADHD Profile ({profile_info.get('label', adhd_type)}):",
            f"  Strengths: {', '.join(profile_info.get('strengths', []))}",
            f"  Needs: {', '.join(profile_info.get('needs', []))}",
        ])
        
        return "\n".join(lines)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    model = JobScoreModelV2()
    
    # Example user questionnaire responses
    user_questionnaire = {
        'adhd_profile_type': 'inattentive',
        'work_preferences': ['Clear priorities', 'Visual workflow'],
        'support_needs': ['Written instructions', 'Calendar reminders'],
        'energy_patterns': ['Best with routine', 'Best with short focus sprints'],
        'primary_role': 'Software Developer',
        'role_duration': '1-2 years',
        'skills': ['Python', 'JavaScript', 'Problem-solving', 'Git']
    }
    
    # Example occupation
    occupation = {
        'occupation_id': 2611,
        'occupation_name': 'Software Developer',
        'anzsco_code': '2611',
        'adhd_friendliness_score': 72,
        'work_complexity': 'High',
        'typical_hours_per_week': 40,
        'implied_skills': ['Python', 'JavaScript', 'Problem-solving', 'Debugging', 'Testing']
    }
    
    # Calculate score
    result = model.score_job_match(user_questionnaire, occupation, verbose=True)
    
    print("\n" + "=" * 80)
    print("JOB MATCH RESULT")
    print("=" * 80)
    print(f"\nScore: {result['score']}/100")
    print(f"Confidence: {result['match_confidence']}")
    print(f"\nRecommendation:\n{result['recommendation']}")
    print(f"\nKey Strengths:\n" + "\n".join(f"  • {s}" for s in result['key_strengths']))
    print(f"\nKey Challenges:\n" + "\n".join(f"  • {c}" for c in result['key_challenges']))
    print(f"\nSuggested Accommodations:\n" + "\n".join(f"  • {a}" for a in result['suggested_accommodations']))
    print("\n" + "=" * 80)
