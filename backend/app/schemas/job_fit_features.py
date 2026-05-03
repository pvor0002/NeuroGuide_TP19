"""Structured job characteristics extracted by Gemini for ADHD-aware scoring."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


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
