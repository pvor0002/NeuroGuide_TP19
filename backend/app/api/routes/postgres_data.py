"""
PostgreSQL CRUD for ``users`` and ``career_profiles``.

All mutating and user-scoped read routes require session authentication
(``X-NG-User-Id`` + ``X-NG-Pass-Key``). User accounts are created only via
``POST /pg/session/register`` — not through this router.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import Response

from app.api.deps.auth import SessionUser, require_self
from app.core.config import Settings, get_settings
from app.db.postgres import get_db_connection
from app.schemas.postgres_data import (
    CareerProfileCreate,
    CareerProfileResponse,
    CareerProfileUpdate,
    UserResponse,
)
from app.services import pg_career_profiles, pg_users

router = APIRouter(prefix="/pg", tags=["postgres"])


def _require_database(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PostgreSQL is not configured. Set DATABASE_URL in the environment.",
        )


DatabaseConfigured = Annotated[None, Depends(_require_database)]


def _pg_http_error(exc: psycopg2.Error) -> HTTPException:
    msg = str(exc).strip()
    if isinstance(exc, psycopg2.errors.UniqueViolation):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg or "Unique constraint violation.")
    if isinstance(exc, psycopg2.errors.ForeignKeyViolation):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg or "Foreign key violation — create the user first or fix user_id.",
        )
    if isinstance(exc, psycopg2.OperationalError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=msg or "Database connection or query failed.",
        )
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg or "Database error.")


@router.get("/health", summary="Check DATABASE_URL and run SELECT 1")
def pg_health(_: DatabaseConfigured, settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    try:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        finally:
            conn.close()
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    host = ""
    if settings.database_url:
        from urllib.parse import urlparse

        u = urlparse(str(settings.database_url))
        host = u.hostname or ""
    return {"status": "ok", "host": host}


@router.get("/users/{user_id}", response_model=UserResponse, summary="Get own user row by id")
def get_user_route(_: DatabaseConfigured, user: SessionUser, user_id: UUID) -> UserResponse:
    require_self(user, user_id)
    row = pg_users.get_user(user_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserResponse.model_validate(row)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete own user row by id",
)
def delete_user_route(_: DatabaseConfigured, user: SessionUser, user_id: UUID) -> Response:
    require_self(user, user_id)
    try:
        deleted = pg_users.delete_user(user_id)
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/career-profiles",
    response_model=CareerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a career profile row for the authenticated user",
)
def create_career_profile_route(
    _: DatabaseConfigured,
    user: SessionUser,
    body: CareerProfileCreate,
) -> CareerProfileResponse:
    require_self(user, body.user_id)
    try:
        row = pg_career_profiles.create_career_profile(body.user_id, body.profile)
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    return CareerProfileResponse.model_validate(row)


@router.get(
    "/career-profiles",
    response_model=list[CareerProfileResponse],
    summary="List career profiles for the authenticated user",
)
def list_career_profiles_route(
    _: DatabaseConfigured,
    user: SessionUser,
) -> list[CareerProfileResponse]:
    try:
        rows = pg_career_profiles.list_career_profiles_for_user(user)
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    return [CareerProfileResponse.model_validate(r) for r in rows]


@router.get("/career-profiles/{profile_id}", response_model=CareerProfileResponse, summary="Get own career profile by id")
def get_career_profile_route(
    _: DatabaseConfigured,
    user: SessionUser,
    profile_id: UUID,
) -> CareerProfileResponse:
    row = pg_career_profiles.get_career_profile_for_user(profile_id, user)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Career profile not found.")
    return CareerProfileResponse.model_validate(row)


@router.put("/career-profiles/{profile_id}", response_model=CareerProfileResponse, summary="Replace own profile JSON")
def update_career_profile_route(
    _: DatabaseConfigured,
    user: SessionUser,
    profile_id: UUID,
    body: CareerProfileUpdate,
) -> CareerProfileResponse:
    try:
        row = pg_career_profiles.update_career_profile_for_user(profile_id, user, body.profile)
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Career profile not found.")
    return CareerProfileResponse.model_validate(row)


@router.delete(
    "/career-profiles/{profile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete own career profile by id",
)
def delete_career_profile_route(
    _: DatabaseConfigured,
    user: SessionUser,
    profile_id: UUID,
) -> Response:
    try:
        deleted = pg_career_profiles.delete_career_profile_for_user(profile_id, user)
    except psycopg2.Error as exc:
        raise _pg_http_error(exc) from exc
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Career profile not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
