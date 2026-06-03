"""Authenticated storage for saved Day in the Life timelines (RDS)."""

from __future__ import annotations

from typing import Annotated

import psycopg2
import psycopg2.errors as pg_errors
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.api.deps.auth import SessionUser
from app.core.config import Settings, get_settings
from app.schemas.day_in_life_storage import (
    DayInLifeSessionListResponse,
    DayInLifeSessionRow,
    DayInLifeSessionUpsert,
    DayInLifeSessionUpsertResponse,
)
from app.services import pg_day_in_life

router = APIRouter(prefix="/pg/day-in-life", tags=["day-in-life-storage"])


def _need_database(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PostgreSQL is not configured (DATABASE_URL).",
        )


DatabaseConfigured = Annotated[None, Depends(_need_database)]


def _pg_err(exc: psycopg2.Error) -> HTTPException:
    if isinstance(exc, pg_errors.UndefinedTable):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Table day_in_life_sessions is missing. Run backend/sql/day_in_life_sessions.sql "
                "on this database, then retry."
            ),
        )
    if isinstance(exc, pg_errors.OperationalError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc).strip())
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc).strip())


@router.get("/sessions", response_model=DayInLifeSessionListResponse)
def list_sessions_route(
    _: DatabaseConfigured,
    user: SessionUser,
) -> DayInLifeSessionListResponse:
    try:
        rows = pg_day_in_life.list_sessions_for_user(user)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    return DayInLifeSessionListResponse(sessions=[DayInLifeSessionRow.from_db(r) for r in rows])


@router.put("/sessions", response_model=DayInLifeSessionUpsertResponse)
def upsert_session_route(
    _: DatabaseConfigured,
    user: SessionUser,
    body: DayInLifeSessionUpsert,
) -> DayInLifeSessionUpsertResponse:
    try:
        row = pg_day_in_life.upsert_session(
            user,
            job_title=body.job_title.strip(),
            adhd_type=body.adhd_type.strip(),
            timeline=[x for x in body.timeline if isinstance(x, dict)],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    return DayInLifeSessionUpsertResponse(session=DayInLifeSessionRow.from_db(row))


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_session_route(
    _: DatabaseConfigured,
    user: SessionUser,
    session_id: UUID,
) -> Response:
    try:
        deleted = pg_day_in_life.delete_session_by_id(user, session_id)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved day in the life not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
