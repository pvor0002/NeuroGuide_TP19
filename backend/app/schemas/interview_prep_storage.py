"""RDS payloads for interview prep progress (bundled with simplified job)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InterviewPrepProgressUpsert(BaseModel):
    job_fingerprint: str = Field(..., min_length=1, max_length=512)
    simplified_job: Optional[dict[str, Any]] = None
    interview_questions: list[str] = Field(default_factory=list)
    progress: dict[str, Any] = Field(
        default_factory=dict,
        description="bundles (per-question), active_question, saved_answers, etc.",
    )


class InterviewPrepProgressResponse(BaseModel):
    id: UUID
    user_id: UUID
    job_fingerprint: str
    simplified_job: Optional[dict[str, Any]] = None
    interview_questions: list[str] = Field(default_factory=list)
    progress: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime


class InterviewPrepSessionSummary(BaseModel):
    id: UUID
    job_fingerprint: str
    simplified_job: Optional[dict[str, Any]] = None
    updated_at: datetime


class InterviewPrepSessionListResponse(BaseModel):
    sessions: list[InterviewPrepSessionSummary]
