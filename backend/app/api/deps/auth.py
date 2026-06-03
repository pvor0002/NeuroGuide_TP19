"""Shared session authentication dependency (X-NG-User-Id + X-NG-Pass-Key)."""

from __future__ import annotations

from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.services import pg_session


def _need_pepper(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PostgreSQL is not configured (DATABASE_URL).",
        )
    if not settings.pass_key_pepper or not str(settings.pass_key_pepper).strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PASS_KEY_PEPPER is not set — session endpoints are disabled.",
        )


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


def require_self(user: UUID, target_user_id: UUID) -> None:
    """Return 404 (not 403) when the caller tries to access another user's record."""
    if user != target_user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
