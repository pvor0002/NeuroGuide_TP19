"""
DAY IN THE LIFE SCHEMAS
=======================
Pydantic models for request and response validation.

Used by POST /day-in-life endpoint.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class DayInLifeRequest(BaseModel):
    job_title: str = Field(
        ...,
        min_length=1,
        description="Job title extracted by Gemini from the job description",
        examples=["UX Designer", "Software Developer", "Cloud Developer"]
    )
    adhd_type: str = Field(
        ...,
        description="ADHD profile type from the user's session",
        examples=["inattentive", "hyperactive", "combined"]
    )

#response schema, contains multiple time blocks
class TimeBlock(BaseModel):
    time: str = Field(
        ...,
        description="Start time of this block",
        examples=["9:00 AM", "11:00 AM"]
    )
    task: str = Field(
        ...,
        description="Short name for the task or activity",
        examples=["Deep design work — Figma wireframes", "Lunch break"]
    )
    description: str = Field(
        ...,
        description="1–2 sentence description of what happens in this block",
        examples=["Solo, uninterrupted design sprint. Create user flows for the onboarding screen."]
    )
    energy_level: str = Field(
        ...,
        description="Cognitive demand level for this block",
        examples=["low", "medium", "high", "break"]
    )
    adhd_tip: Optional[str] = Field(
        default=None,
        description="One practical ADHD-specific tip for this block. Null for break blocks.",
        examples=["Block notifications. Use 25-min Pomodoro sprints."]
    )


class DayInLifeResponse(BaseModel):
    job_title: str = Field(
        ...,
        description="The job title used to generate this day"
    )
    adhd_type: str = Field(
        ...,
        description="The ADHD type used to personalise the tips"
    )
    data_source: str = Field(
        ...,
        description=(
            "'anzsco' = real AU government data was found and used. "
            "'gemini_fallback' = job not in ANZSCO dataset, Gemini used general knowledge."
        ),
        examples=["anzsco", "gemini_fallback"]
    )
    timeline: List[TimeBlock] = Field(
        ...,
        description="Ordered list of time blocks representing the workday (typically 7–9 blocks)"
    )