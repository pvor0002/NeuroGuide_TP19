"""CRUD helpers for the ``career_profiles`` table."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

from app.db.postgres import get_db_connection

logger = logging.getLogger(__name__)


def _normalize_profile(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed: Any = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def create_career_profile(user_id: UUID, profile: dict) -> dict:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            INSERT INTO career_profiles (user_id, profile)
            VALUES (%s, %s)
            RETURNING id, user_id, profile, created_at, updated_at
            """,
            (str(user_id), Json(profile)),
        )
        row = cursor.fetchone()
        conn.commit()
        out = dict(row) if row else {}
        if out.get("profile") is not None:
            out["profile"] = _normalize_profile(out["profile"])
        return out
    except psycopg2.Error as exc:
        conn.rollback()
        logger.warning("[PG career_profiles] create failed: %s", exc)
        raise
    finally:
        conn.close()


def get_career_profile(profile_id: UUID) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            SELECT id, user_id, profile, created_at, updated_at
            FROM career_profiles
            WHERE id = %s
            """,
            (str(profile_id),),
        )
        row = cursor.fetchone()
        if not row:
            return None
        out = dict(row)
        out["profile"] = _normalize_profile(out.get("profile"))
        return out
    finally:
        conn.close()


def get_career_profile_for_user(profile_id: UUID, user_id: UUID) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            SELECT id, user_id, profile, created_at, updated_at
            FROM career_profiles
            WHERE id = %s AND user_id = %s
            """,
            (str(profile_id), str(user_id)),
        )
        row = cursor.fetchone()
        if not row:
            return None
        out = dict(row)
        out["profile"] = _normalize_profile(out.get("profile"))
        return out
    finally:
        conn.close()


def list_career_profiles_for_user(user_id: UUID) -> list[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            SELECT id, user_id, profile, created_at, updated_at
            FROM career_profiles
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (str(user_id),),
        )
        rows = cursor.fetchall()
        out: list[dict] = []
        for row in rows:
            d = dict(row)
            d["profile"] = _normalize_profile(d.get("profile"))
            out.append(d)
        return out
    finally:
        conn.close()


def update_career_profile(profile_id: UUID, profile: dict) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            UPDATE career_profiles
            SET profile = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, user_id, profile, created_at, updated_at
            """,
            (Json(profile), str(profile_id)),
        )
        row = cursor.fetchone()
        conn.commit()
        if not row:
            return None
        out = dict(row)
        out["profile"] = _normalize_profile(out.get("profile"))
        return out
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_career_profile_for_user(profile_id: UUID, user_id: UUID, profile: dict) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """
            UPDATE career_profiles
            SET profile = %s, updated_at = now()
            WHERE id = %s AND user_id = %s
            RETURNING id, user_id, profile, created_at, updated_at
            """,
            (Json(profile), str(profile_id), str(user_id)),
        )
        row = cursor.fetchone()
        conn.commit()
        if not row:
            return None
        out = dict(row)
        out["profile"] = _normalize_profile(out.get("profile"))
        return out
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_career_profile(profile_id: UUID) -> bool:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM career_profiles WHERE id = %s", (str(profile_id),))
        deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_career_profile_for_user(profile_id: UUID, user_id: UUID) -> bool:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM career_profiles WHERE id = %s AND user_id = %s",
            (str(profile_id), str(user_id)),
        )
        deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()
