"""Authenticated CRUD for interview prep progress (RDS)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

import psycopg2
import psycopg2.errors as pg_errors
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.api.routes.session import SessionUser
from app.core.config import Settings, get_settings
from app.schemas.interview_prep_storage import (
    InterviewPrepProgressResponse,
    InterviewPrepProgressUpsert,
    InterviewPrepSessionListResponse,
    InterviewPrepSessionSummary,
)
from app.services import pg_interview_prep

router = APIRouter(prefix="/pg/interview-prep", tags=["interview-prep-storage"])


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
                "Table interview_prep_sessions is missing. Run backend/sql/interview_prep_sessions.sql "
                "on this database, then retry."
            ),
        )
    if isinstance(exc, psycopg2.OperationalError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc).strip())
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc).strip())


def _row_to_response(row: dict) -> InterviewPrepProgressResponse:
    iq = row.get("interview_questions") or []
    if not isinstance(iq, list):
        iq = []
    pr = row.get("progress") or {}
    if not isinstance(pr, dict):
        pr = {}
    sj = row.get("simplified_job")
    if sj is not None and not isinstance(sj, dict):
        sj = None
    return InterviewPrepProgressResponse(
        id=UUID(str(row["id"])),
        user_id=UUID(str(row["user_id"])),
        job_fingerprint=str(row["job_fingerprint"]),
        simplified_job=sj,
        interview_questions=[str(x) for x in iq],
        progress=pr,
        updated_at=row["updated_at"],
    )


def _summary_from_row(row: dict) -> InterviewPrepSessionSummary:
    sj = row.get("simplified_job")
    if sj is not None and not isinstance(sj, dict):
        sj = None
    return InterviewPrepSessionSummary(
        id=UUID(str(row["id"])),
        job_fingerprint=str(row["job_fingerprint"]),
        simplified_job=sj,
        updated_at=row["updated_at"],
    )


@router.get("/sessions", response_model=InterviewPrepSessionListResponse)
def list_interview_prep_sessions_route(
    _: DatabaseConfigured,
    user: SessionUser,
) -> InterviewPrepSessionListResponse:
    try:
        rows = pg_interview_prep.list_sessions_for_user(user)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    return InterviewPrepSessionListResponse(sessions=[_summary_from_row(r) for r in rows])


@router.get("/progress", response_model=InterviewPrepProgressResponse)
def get_progress_route(
    _: DatabaseConfigured,
    user: SessionUser,
    job_fingerprint: Annotated[str, Query(min_length=1, max_length=512)],
) -> InterviewPrepProgressResponse:
    try:
        row = pg_interview_prep.get_progress(user, job_fingerprint)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No saved interview prep for this job.")
    return _row_to_response(row)


@router.put("/progress", response_model=InterviewPrepProgressResponse)
def put_progress_route(
    _: DatabaseConfigured,
    user: SessionUser,
    body: InterviewPrepProgressUpsert,
) -> InterviewPrepProgressResponse:
    try:
        row = pg_interview_prep.upsert_progress(
            user,
            job_fingerprint=body.job_fingerprint.strip(),
            simplified_job=body.simplified_job,
            interview_questions=list(body.interview_questions or []),
            progress=body.progress if isinstance(body.progress, dict) else {},
        )
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    return _row_to_response(row)


@router.delete(
    "/progress",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_progress_route(
    _: DatabaseConfigured,
    user: SessionUser,
    job_fingerprint: Annotated[str, Query(min_length=1, max_length=512)],
) -> Response:
    try:
        deleted = pg_interview_prep.delete_progress(user, job_fingerprint.strip())
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No saved interview prep for this job.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
