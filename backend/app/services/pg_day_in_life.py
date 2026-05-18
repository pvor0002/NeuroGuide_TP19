"""PostgreSQL persistence for saved Day in the Life timelines."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from uuid import UUID

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

from app.db.postgres import get_db_connection

logger = logging.getLogger(__name__)


_WS = re.compile(r"\s+")


def normalize_job_title(title: str) -> str:
    return _WS.sub(" ", str(title or "").strip()).lower()


def normalize_adhd_type(adhd: str) -> str:
    return str(adhd or "").strip().lower()


def list_sessions_for_user(user_id: UUID, *, limit: int = 48) -> list[dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, user_id, job_title, job_title_norm, adhd_type, adhd_type_norm,
                   timeline, created_at, updated_at
            FROM day_in_life_sessions
            WHERE user_id = %s
            ORDER BY updated_at DESC
            LIMIT %s
            """,
            (str(user_id), min(max(limit, 1), 100)),
        )
        rows = cur.fetchall() or []
        return [dict(r) for r in rows]
    finally:
        conn.close()


def upsert_session(
    user_id: UUID,
    *,
    job_title: str,
    adhd_type: str,
    timeline: list[dict[str, Any]],
) -> dict[str, Any]:
    jtn = normalize_job_title(job_title)
    atn = normalize_adhd_type(adhd_type)
    if not jtn or not atn:
        raise ValueError("job_title and adhd_type are required after normalization.")

    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO day_in_life_sessions (
                user_id, job_title, job_title_norm, adhd_type, adhd_type_norm, timeline, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (user_id, job_title_norm, adhd_type_norm) DO UPDATE SET
                job_title = EXCLUDED.job_title,
                adhd_type = EXCLUDED.adhd_type,
                timeline = EXCLUDED.timeline,
                updated_at = now()
            RETURNING id, user_id, job_title, job_title_norm, adhd_type, adhd_type_norm,
                      timeline, created_at, updated_at
            """,
            (
                str(user_id),
                str(job_title).strip()[:512],
                jtn[:512],
                str(adhd_type).strip()[:128],
                atn[:128],
                Json(timeline if isinstance(timeline, list) else []),
            ),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            raise RuntimeError("day_in_life_sessions upsert returned no row.")
        return dict(row)
    except psycopg2.Error:
        conn.rollback()
        logger.exception("[PG day_in_life] upsert_session failed")
        raise
    finally:
        conn.close()


def delete_session_by_id(user_id: UUID, session_id: UUID) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            DELETE FROM day_in_life_sessions
            WHERE user_id = %s AND id = %s
            """,
            (str(user_id), str(session_id)),
        )
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except psycopg2.Error:
        conn.rollback()
        logger.exception("[PG day_in_life] delete_session_by_id failed")
        raise
    finally:
        conn.close()


def get_session(
    user_id: UUID,
    *,
    job_title_norm: str,
    adhd_type_norm: str,
) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, user_id, job_title, job_title_norm, adhd_type, adhd_type_norm,
                   timeline, created_at, updated_at
            FROM day_in_life_sessions
            WHERE user_id = %s AND job_title_norm = %s AND adhd_type_norm = %s
            """,
            (str(user_id), job_title_norm, adhd_type_norm),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
