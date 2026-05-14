"""Request/response models for RDS-backed ``users`` and ``career_profiles`` tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """Create a row in ``users``. Omit ``id`` to let PostgreSQL generate one."""

    id: Optional[UUID] = Field(
        default=None,
        description="Client-generated UUID (e.g. from the browser). If omitted, the database assigns one.",
    )


class UserResponse(BaseModel):
    id: UUID
    created_at: datetime


class CareerProfileCreate(BaseModel):
    user_id: UUID
    profile: dict[str, Any] = Field(default_factory=dict)


class CareerProfileUpdate(BaseModel):
    profile: dict[str, Any]


class CareerProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    profile: dict[str, Any]
    created_at: datetime
    updated_at: datetime
