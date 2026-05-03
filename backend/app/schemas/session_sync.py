"""Register / login / full-sync payloads for browser session + RDS."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RegisterBody(BaseModel):
    user_id: UUID
    pass_key: str = Field(..., min_length=4, max_length=64)
    consent: dict[str, Any] = Field(default_factory=dict)
    career_wizard: Optional[dict[str, Any]] = None
    job_workbench: Optional[dict[str, Any]] = None


class LoginBody(BaseModel):
    pass_key: str = Field(..., min_length=4, max_length=64)


class FullSyncBody(BaseModel):
    consent: Optional[dict[str, Any]] = None
    career_wizard: Optional[dict[str, Any]] = None
    job_workbench: Optional[dict[str, Any]] = None


class ConsentPatchBody(BaseModel):
    consent_granted: bool
    consent: dict[str, Any] = Field(default_factory=dict)


class SessionSnapshot(BaseModel):
    user_id: UUID
    user_created_at: Optional[datetime] = None
    consent: Optional[dict[str, Any]] = None
    consent_granted: bool = False
    career_profile: Optional[dict[str, Any]] = None
    job_workbench: Optional[dict[str, Any]] = None
