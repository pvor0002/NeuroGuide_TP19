from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DayInLifeSessionUpsert(BaseModel):
    job_title: str = Field(..., min_length=1, max_length=512)
    adhd_type: str = Field(..., min_length=1, max_length=128)
    timeline: list[dict[str, Any]] = Field(default_factory=list)


class DayInLifeSessionRow(BaseModel):
    id: UUID
    user_id: UUID
    job_title: str
    job_title_norm: str
    adhd_type: str
    adhd_type_norm: str
    timeline: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_db(cls, row: dict[str, Any]) -> "DayInLifeSessionRow":
        tl = row.get("timeline")
        if not isinstance(tl, list):
            tl = []
        return cls(
            id=UUID(str(row["id"])),
            user_id=UUID(str(row["user_id"])),
            job_title=str(row["job_title"]),
            job_title_norm=str(row["job_title_norm"]),
            adhd_type=str(row["adhd_type"]),
            adhd_type_norm=str(row["adhd_type_norm"]),
            timeline=[x for x in tl if isinstance(x, dict)],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class DayInLifeSessionUpsertResponse(BaseModel):
    session: DayInLifeSessionRow


class DayInLifeSessionListResponse(BaseModel):
    sessions: list[DayInLifeSessionRow]

