"""
JOB SCORE SCHEMAS
=================
Pydantic models for request and response validation.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.job_fit_features import GeminiJobFitFeatures


class UserQuestionnaire(BaseModel):
    adhd_profile_type: str = Field(
        ...,
        description="ADHD profile type",
        examples=["inattentive", "hyperactive-impulsive", "combined"]
    )
    work_preferences: List[str] = Field(
        default=[],
        description="Up to 2 work preferences",
        examples=[["Clear priorities", "Visual workflow"]]
    )
    support_needs: List[str] = Field(
        default=[],
        description="Up to 2 support needs",
        examples=[["Written instructions", "Calendar reminders"]]
    )
    energy_patterns: List[str] = Field(
        default=[],
        description="Up to 2 energy patterns",
        examples=[["Best with routine"]]
    )
    primary_role: str = Field(
        default="",
        description="User's primary role",
        examples=["Software Developer"]
    )
    role_duration: str = Field(
        default="Internship",
        description="Duration in role",
        examples=["1-2 years"]
    )
    skills: List[str] = Field(
        default=[],
        description="User's skills",
        examples=[["Python", "JavaScript", "Problem-solving"]]
    )


class JobScoreRequest(BaseModel):
    user_questionnaire: UserQuestionnaire
    occupation_id: int = Field(
        ...,
        description="ID of the occupation to score against",
        examples=[684]
    )
    job_skills_from_gemini: Optional[List[str]] = Field(
        default=None,
        description="Skills extracted by Gemini from the job description. Overrides implied_skills from DB.",
        examples=[["Python", "JavaScript", "Testing", "Git", "Problem-solving"]]
    )
    job_fit_features_from_gemini: Optional[GeminiJobFitFeatures] = Field(
        default=None,
        description=(
            "Structured job signals from Gemini (task structure, environment, cognitive load, etc.)"
        ),
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Anonymous session ID for saving results"
    )


class FactorDetail(BaseModel):
    adjustment: float
    reasoning: str
    max_points: Optional[int] = None
    selected: Optional[List[str]] = None
    role: Optional[str] = None
    duration: Optional[str] = None
    user_skills: Optional[List[str]] = None
    job_skills: Optional[List[str]] = None
    job_complexity: Optional[str] = None


class OccupationInfo(BaseModel):
    name: str
    anzsco_code: str
    complexity: str


class JobScoreResponse(BaseModel):
    score: float = Field(..., description="Job match score (0-100)")
    match_confidence: float = Field(..., description="Confidence level (0-1)")
    recommendation: str = Field(..., description="Recommendation text")
    reasoning: str = Field(..., description="Detailed reasoning")
    factor_breakdown: Dict = Field(..., description="Breakdown of 7 scoring factors")
    key_strengths: List[str] = Field(..., description="User's key strengths for this role")
    key_challenges: List[str] = Field(..., description="Challenges to manage")
    suggested_accommodations: List[str] = Field(..., description="Recommended supports")
    occupation: Optional[OccupationInfo] = None
    ml_layer: Optional[Dict] = Field(
        default=None,
        description="Hybrid ML + rule blend metadata (job_success_probability, rule_score_0_100, etc.)",
    )
