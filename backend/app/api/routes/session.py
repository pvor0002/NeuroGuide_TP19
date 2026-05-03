"""
Browser session sync (consent + pass key + career profile + job workbench).

Expected tables (run on RDS before using these routes):

.. code-block:: sql

    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS user_credentials (
        user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        pass_key_hash TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS consent_records (
        user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        consent_granted BOOLEAN NOT NULL,
        consent_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS career_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        profile JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_career_profiles_user_id ON career_profiles (user_id);
    CREATE TABLE IF NOT EXISTS job_workbench_state (
        user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        state JSONB NOT NULL DEFAULT '{}'::jsonb
    );

Set ``DATABASE_URL``, ``PASS_KEY_PEPPER`` (long random secret), and optionally share the same DB
with occupation/job-score tables.
"""

from __future__ import annotations

from typing import Annotated, Optional
from uuid import UUID

import psycopg2
import psycopg2.errors as pg_errors
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.session_sync import (
    ConsentPatchBody,
    FullSyncBody,
    LoginBody,
    RegisterBody,
    SessionSnapshot,
)
from app.services import pg_session

router = APIRouter(prefix="/pg/session", tags=["session"])


def _need_database(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PostgreSQL is not configured (DATABASE_URL).",
        )


def _need_pepper(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    _need_database(settings)
    if not settings.pass_key_pepper or not str(settings.pass_key_pepper).strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PASS_KEY_PEPPER is not set — session endpoints are disabled.",
        )


def _pg_err(exc: psycopg2.Error) -> HTTPException:
    if isinstance(exc, psycopg2.errors.UniqueViolation):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc).strip() or "Conflict.")
    if isinstance(exc, pg_errors.UndefinedTable):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "PostgreSQL table missing. Run backend/sql/session_tables.sql on this database, "
                "then retry."
            ),
        )
    if isinstance(exc, psycopg2.OperationalError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc).strip())
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc).strip())


def get_session_user(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ng_user_id: Annotated[Optional[str], Header(alias="X-NG-User-Id")] = None,
    x_ng_pass_key: Annotated[Optional[str], Header(alias="X-NG-Pass-Key")] = None,
) -> UUID:
    _need_pepper(settings)
    if not x_ng_user_id or not x_ng_pass_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-NG-User-Id or X-NG-Pass-Key.",
        )
    try:
        uid = UUID(str(x_ng_user_id).strip())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id.") from exc
    if not pg_session.verify_pass_key(uid, x_ng_pass_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid pass key.")
    return uid


SessionUser = Annotated[UUID, Depends(get_session_user)]


@router.post("/register", response_model=SessionSnapshot, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterBody,
    _: Annotated[None, Depends(_need_pepper)],
) -> SessionSnapshot:
    try:
        snap = pg_session.register_account(
            body.user_id,
            body.pass_key,
            consent=body.consent,
            career_wizard=body.career_wizard,
            job_workbench=body.job_workbench,
        )
        return SessionSnapshot.model_validate(snap)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.post("/login", response_model=SessionSnapshot)
def login(body: LoginBody, _: Annotated[None, Depends(_need_pepper)]) -> SessionSnapshot:
    try:
        uid = pg_session.resolve_user_id_by_pass_key(body.pass_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc
    if uid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pass key not recognised.")
    try:
        snap = pg_session.fetch_snapshot(uid)
        return SessionSnapshot.model_validate(snap)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.put("/sync", response_model=SessionSnapshot)
def full_sync_route(user: SessionUser, body: FullSyncBody) -> SessionSnapshot:
    try:
        snap = pg_session.full_sync(
            user,
            consent=body.consent,
            career_wizard=body.career_wizard,
            job_workbench=body.job_workbench,
        )
        return SessionSnapshot.model_validate(snap)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.patch("/consent", status_code=status.HTTP_204_NO_CONTENT)
def patch_consent(user: SessionUser, body: ConsentPatchBody) -> None:
    try:
        pg_session.patch_consent_only(user, body.consent_granted, body.consent)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.delete("/data/profile", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile_data(user: SessionUser) -> None:
    try:
        pg_session.delete_career_data_only(user)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.delete("/data/all", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_data(user: SessionUser) -> None:
    try:
        pg_session.delete_all_user_rows(user)
    except psycopg2.Error as exc:
        raise _pg_err(exc) from exc


@router.get("/health")
def session_health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    _need_database(settings)
    pepper_ok = bool(settings.pass_key_pepper and str(settings.pass_key_pepper).strip())
    return {"database_url_set": "yes", "pass_key_pepper_set": "yes" if pepper_ok else "no"}
