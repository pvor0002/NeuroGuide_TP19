"""Structured job characteristics extracted by Gemini for ADHD-aware scoring."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkEnvironmentStructured(BaseModel):
    """Structured posting environment from Gemini (no user-facing scoring logic)."""

    model_config = ConfigDict(extra="ignore")

    interruptions: Optional[str] = Field(
        default=None,
        description="low | medium | high — meetings, pings, context switches",
    )
    task_structure: Optional[str] = Field(
        default=None,
        description="structured | mixed | dynamic",
    )
    collaboration: Optional[str] = Field(
        default=None,
        description="low | medium | high — teamwork and synchronous touchpoints",
    )
    communication_style: Optional[str] = Field(
        default=None,
        description="written | mixed | verbal",
    )
    pace: Optional[str] = Field(
        default=None,
        description="slow | moderate | fast",
    )
    cognitive_load: Optional[str] = Field(
        default=None,
        description="low | medium | high",
    )
    autonomy: Optional[str] = Field(
        default=None,
        description="low | medium | high — independence in scheduling/priorities",
    )


class SoftSkillRequirements(BaseModel):
    """
    Non-technical soft skills implied by the posting (NOT programming/tools).
    Each value must be one of: low | medium | high (job requirement strength).
    """

    model_config = ConfigDict(extra="ignore")

    communication: Optional[str] = Field(
        default=None,
        description="low | medium | high — written/verbal stakeholder communication",
    )
    time_management: Optional[str] = Field(
        default=None,
        description="low | medium | high — planning, deadlines, prioritization",
    )
    problem_solving: Optional[str] = Field(
        default=None,
        description="low | medium | high — ambiguity, diagnosis, solution design",
    )
    leadership: Optional[str] = Field(
        default=None,
        description="low | medium | high — owning outcomes, directing others",
    )
    teamwork: Optional[str] = Field(
        default=None,
        description="low | medium | high — collaboration, pair work, shared ownership",
    )
    adaptability: Optional[str] = Field(
        default=None,
        description="low | medium | high — shifting priorities, context changes",
    )
    self_motivation: Optional[str] = Field(
        default=None,
        description="low | medium | high — self-directed progress without heavy oversight",
    )


class GeminiJobFitFeatures(BaseModel):
    """
    Normalized labels (Gemini should output these tokens; backend tolerates variants).
    """

    model_config = ConfigDict(extra="ignore")

    task_structure: Optional[str] = Field(
        default=None,
        description="structured | unstructured | mixed",
    )
    work_environment: Optional[str] = Field(
        default=None,
        description="quiet | collaborative | fast-paced | mixed",
    )
    cognitive_load: Optional[str] = Field(
        default=None,
        description="low | medium | high",
    )
    attention_switching: Optional[str] = Field(
        default=None,
        description="low | high",
    )
    deadline_pressure: Optional[str] = Field(
        default=None,
        description="low | high",
    )
    autonomy: Optional[str] = Field(
        default=None,
        description="low | medium | high",
    )
    work_style: Optional[str] = Field(
        default=None,
        description="deep_focus | context_switching | mixed — how work is typically done",
    )
    collaboration: Optional[str] = Field(
        default=None,
        description="low | medium | high — intensity of teamwork/meetings",
    )
    interruptions: Optional[str] = Field(
        default=None,
        description="low | medium | high — how often work is interrupted or context-switched",
    )
    soft_skill_requirements: Optional[SoftSkillRequirements] = Field(
        default=None,
        description=(
            "Separate from technical skills: rate how much the role requires each soft skill "
            "(low | medium | high)."
        ),
    )
    work_environment_structured: Optional[WorkEnvironmentStructured] = Field(
        default=None,
        description=(
            "Structured interpretation of how this posting tends to feel day to day "
            "(used for Work Environment Fit UI)."
        ),
    )
    required_experience_years: Optional[float] = Field(
        default=None,
        description=(
            "Minimum years of professional experience stated in the posting (e.g. 5 for '5+ years'). "
            "Use null if not stated."
        ),
    )
    entry_level_friendly: Optional[bool] = Field(
        default=None,
        description=(
            "True if the posting reads as intern/graduate/junior/entry-level friendly "
            "(lighter experience expectations)."
        ),
    )
