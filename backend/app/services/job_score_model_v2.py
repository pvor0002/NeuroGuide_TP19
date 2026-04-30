#!/usr/bin/env python3
"""
JOB SCORE MODEL v2 - WITH USER PREFERENCES
============================================

This updated model integrates the comprehensive user preference questionnaire:

1. TYPE CLASSIFICATION
   - ADHD Profile (from quiz or direct selection): inattentive, hyperactive-impulsive, combined

2. WORK PREFERENCES (up to 2)
   - Clear priorities, Short tasks, Visual workflow, Low interruptions,
     Collaborative team, Quiet work blocks

3. SUPPORT SETUP
   A. Supports (up to 2):
      - Written instructions, Calendar reminders, Checklists, Regular check-ins,
        Flexible start time, Noise-reduced space, Task batching, Break prompts
   
   B. Time & Energy (up to 2):
      - Best with routine/variety/deadlines/flexible pace/sprints/breaks/boards/
        one-task/quiet/body-doubling/morning/afternoon

4. JOBS & SKILLS
   - Primary role (IT/software focused)
   - Duration in role (Internship, 6 months, 1-2 years)
   - Skills matched to experience

The model uses these user inputs + ADHD training data to score job fit.
"""

import json
from typing import Dict, List, Optional, Tuple

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
        'Best with body-doubling/accountability': 'energy_presence',
        'Best with morning deep work': 'energy_morning',
        'Best with afternoon deep work': 'energy_afternoon'
    }

    # Role duration confidence boost
    ROLE_DURATION_CONFIDENCE = {
        'Internship': 0.7,
        '6 months': 0.85,
        '1-2 years': 1.0
    }

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
        
    def score_job_match(
        self,
        user_questionnaire: Dict,
        occupation: Dict,
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
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 1. ADHD PROFILE TYPE FIT (±20 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        adhd_type = user_questionnaire.get('adhd_profile_type', 'combined')
        adhd_fit, adhd_reasoning = self._score_adhd_type_fit(adhd_type, occupation)
        score += adhd_fit
        factors['adhd_type'] = {
            'adjustment': adhd_fit,
            'reasoning': adhd_reasoning,
            'max_points': 20
        }
        
        if verbose:
            print(f"[ADHD Type] {adhd_fit:+.0f} points: {adhd_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 2. WORK PREFERENCES FIT (±15 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        work_prefs = user_questionnaire.get('work_preferences', [])
        work_fit, work_reasoning = self._score_work_preferences(work_prefs, occupation)
        score += work_fit
        factors['work_preferences'] = {
            'adjustment': work_fit,
            'reasoning': work_reasoning,
            'selected': work_prefs,
            'max_points': 15
        }
        
        if verbose:
            print(f"[Work Preferences] {work_fit:+.0f} points: {work_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 3. SUPPORT NEEDS FIT (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        support_needs = user_questionnaire.get('support_needs', [])
        support_fit, support_reasoning = self._score_support_needs(support_needs, occupation)
        score += support_fit
        factors['support_needs'] = {
            'adjustment': support_fit,
            'reasoning': support_reasoning,
            'selected': support_needs,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Support Needs] {support_fit:+.0f} points: {support_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 4. ENERGY PATTERNS FIT (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        energy_patterns = user_questionnaire.get('energy_patterns', [])
        energy_fit, energy_reasoning = self._score_energy_patterns(energy_patterns, occupation)
        score += energy_fit
        factors['energy_patterns'] = {
            'adjustment': energy_fit,
            'reasoning': energy_reasoning,
            'selected': energy_patterns,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Energy Patterns] {energy_fit:+.0f} points: {energy_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 5. ROLE EXPERIENCE & CONFIDENCE (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        primary_role = user_questionnaire.get('primary_role', '')
        duration = user_questionnaire.get('role_duration', 'Internship')
        role_fit, role_reasoning = self._score_role_experience(primary_role, duration, occupation)
        score += role_fit
        factors['role_experience'] = {
            'adjustment': role_fit,
            'reasoning': role_reasoning,
            'role': primary_role,
            'duration': duration,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Role Experience] {role_fit:+.0f} points: {role_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 6. SKILL MATCH (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        user_skills = user_questionnaire.get('skills', [])
        job_skills = occupation.get('implied_skills', [])
        skill_fit, skill_reasoning = self._score_skill_match(user_skills, job_skills)
        score += skill_fit
        factors['skills'] = {
            'adjustment': skill_fit,
            'reasoning': skill_reasoning,
            'user_skills': user_skills,
            'job_skills': job_skills,
            'max_points': 10
        }
        
        if verbose:
            print(f"[Skills] {skill_fit:+.0f} points: {skill_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 7. JOB COMPLEXITY MATCH (±10 points)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        complexity_fit, complexity_reasoning = self._score_complexity_match(
            adhd_type, work_prefs, occupation
        )
        score += complexity_fit
        factors['complexity'] = {
            'adjustment': complexity_fit,
            'reasoning': complexity_reasoning,
            'job_complexity': occupation.get('work_complexity', 'Medium'),
            'max_points': 10
        }
        
        if verbose:
            print(f"[Complexity] {complexity_fit:+.0f} points: {complexity_reasoning}")
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # FINAL SCORE & INTERPRETATION
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        final_score = max(0, min(100, score))
        
        # Generate recommendations
        recommendation, strengths, challenges, accommodations = \
            self._generate_recommendations(final_score, adhd_type, occupation, user_questionnaire)
        
        # Calculate confidence (how well factors align)
        confidence = self._calculate_confidence(factors)
        
        reasoning = self._build_detailed_reasoning(final_score, factors, occupation, user_questionnaire)
        
        return {
            'score': round(final_score, 1),
            'recommendation': recommendation,
            'reasoning': reasoning,
            'factor_breakdown': factors,
            'key_strengths': strengths,
            'key_challenges': challenges,
            'suggested_accommodations': accommodations,
            'match_confidence': round(confidence, 2),
            'occupation': {
                'name': occupation.get('occupation_name', ''),
                'anzsco_code': occupation.get('anzsco_code', ''),
                'complexity': occupation.get('work_complexity', 'Unknown')
            }
        }
    
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
    
    def _score_work_preferences(self, prefs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score alignment with selected work preferences."""
        if not prefs:
            return 0.0, "No preferences specified"
        
        job_name = occupation.get('occupation_name', '').lower()
        
        # Map job characteristics
        job_traits = {
            'needs_clear_goals': 'manager' in job_name or 'lead' in job_name,
            'needs_task-variety': 'assistant' in job_name or 'coordinator' in job_name,
            'needs_visual_management': 'developer' in job_name or 'designer' in job_name,
            'needs_focus_time': 'developer' in job_name or 'analyst' in job_name,
            'needs_teamwork': 'manager' in job_name or 'team' in job_name,
            'needs_quiet_env': 'developer' in job_name or 'researcher' in job_name,
        }
        
        pref_keys = [self.WORK_PREFERENCES.get(p, '') for p in prefs]
        matches = sum(1 for pk in pref_keys if job_traits.get(pk, False))
        
        if not pref_keys:
            return 0.0, "Unable to map preferences"
        
        match_rate = matches / len(pref_keys)
        
        if match_rate >= 0.8:
            return +15, f"Job aligns with your work style preferences"
        elif match_rate >= 0.5:
            return +5, f"Partial alignment with preferences"
        elif match_rate >= 0.2:
            return -5, f"Some work style mismatches"
        else:
            return -15, f"Job style conflicts with preferences"
    
    def _score_support_needs(self, needs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score availability of needed supports."""
        if not needs:
            return 0.0, "No specific supports needed"
        
        job_name = occupation.get('occupation_name', '').lower()
        
        support_traits = {
            'supports_documentation': 'developer' in job_name or 'analyst' in job_name,
            'supports_scheduling': 'manager' in job_name or 'coordinator' in job_name,
            'supports_task_management': 'manager' in job_name or 'project' in job_name,
            'supports_accountability': 'team' in job_name or 'manager' in job_name,
            'supports_schedule_flexibility': 'freelance' in job_name or 'consultant' in job_name,
            'supports_quiet_env': 'developer' in job_name or 'analyst' in job_name,
            'supports_focus_blocks': 'developer' in job_name or 'writer' in job_name,
            'supports_breaks': 'retail' in job_name or 'service' in job_name,
        }
        
        need_keys = [self.SUPPORT_NEEDS.get(n, '') for n in needs]
        matches = sum(1 for nk in need_keys if support_traits.get(nk, False))
        
        if not need_keys:
            return 0.0, "Unable to map supports"
        
        match_rate = matches / len(need_keys)
        
        if match_rate >= 0.8:
            return +10, "Job likely provides your needed supports"
        elif match_rate >= 0.5:
            return +5, "Some supports may be available"
        elif match_rate == 0:
            return -5, "Limited support infrastructure"
        else:
            return 0, "Mixed support availability"
    
    def _score_energy_patterns(self, patterns: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score alignment with energy/work rhythm preferences."""
        if not patterns:
            return 0.0, "No energy patterns specified"
        
        job_name = occupation.get('occupation_name', '').lower()
        complexity = occupation.get('work_complexity', '').lower()
        
        energy_traits = {
            'energy_routine': complexity in ['low', 'medium'],
            'energy_variety': 'manager' in job_name or 'coordinator' in job_name,
            'energy_deadline_driven': 'project' in job_name or 'manager' in job_name,
            'energy_flexible': 'freelance' in job_name or 'consultant' in job_name,
            'energy_sprints': 'developer' in job_name or 'designer' in job_name,
            'energy_breaks_needed': 'service' in job_name or 'retail' in job_name,
            'energy_visual': 'designer' in job_name or 'developer' in job_name,
            'energy_sequential': 'analyst' in job_name or 'technician' in job_name,
            'energy_quiet': 'researcher' in job_name or 'developer' in job_name,
            'energy_presence': 'team' in job_name or 'manager' in job_name,
        }
        
        pattern_keys = [self.ENERGY_PATTERNS.get(p, '') for p in patterns]
        matches = sum(1 for pk in pattern_keys if energy_traits.get(pk, False))
        
        if matches == len(pattern_keys):
            return +10, "Job pace matches your energy patterns perfectly"
        elif matches >= len(pattern_keys) * 0.5:
            return +5, "Partial alignment on energy/pace"
        else:
            return -10, "Job pace conflicts with energy patterns"
    
    def _score_role_experience(self, role: str, duration: str, occupation: Dict) -> Tuple[float, str]:
        """Score confidence based on similar role experience."""
        if not role:
            return 0.0, "No role experience context"
        
        job_name = occupation.get('occupation_name', '').lower()
        role_lower = role.lower()
        
        # Check if applying for similar role
        is_similar_role = any(keyword in job_name for keyword in role_lower.split())
        
        if not is_similar_role:
            confidence_mult = 0.7
            experience_text = "Transitioning to different role"
        else:
            confidence_mult = 1.0
            experience_text = "Applying for similar role type"
        
        duration_mult = self.ROLE_DURATION_CONFIDENCE.get(duration, 0.7)
        adjustment = (duration_mult - 0.7) * 10 * confidence_mult
        
        return adjustment, f"{experience_text}; duration: {duration}"
    
    def _score_skill_match(self, user_skills: List[str], job_skills: List[str]) -> Tuple[float, str]:
        """Score skill alignment."""
        if not job_skills:
            return 0.0, "No job skills specified"
        
        if not user_skills:
            return -5, "No user skills provided"
        
        user_set = set(s.lower() for s in user_skills)
        job_set = set(s.lower() for s in job_skills)
        
        matches = len(user_set & job_set)
        match_rate = matches / len(job_set) if job_set else 0
        
        if match_rate >= 0.7:
            return +10, f"Strong skill match ({int(match_rate*100)}%)"
        elif match_rate >= 0.4:
            return +5, f"Partial skill match ({int(match_rate*100)}%)"
        elif match_rate > 0:
            return 0, f"Some transferable skills"
        else:
            return -10, "Limited skill overlap"
    
    def _score_complexity_match(self, adhd_type: str, work_prefs: List[str], occupation: Dict) -> Tuple[float, str]:
        """Score appropriateness of job complexity."""
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
    
    def _build_detailed_reasoning(self, score: float, factors: Dict, occupation: Dict, user_data: Dict) -> str:
        """Build detailed explanation of score."""
        lines = [
            f"Your match score for {occupation.get('occupation_name', 'this role')} is {score:.0f}/100.",
            "",
            "Score Breakdown:"
        ]
        
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
