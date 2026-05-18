"""PostgreSQL persistence for interview prep sessions (per user + job fingerprint)."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

from app.db.postgres import get_db_connection

logger = logging.getLogger(__name__)


def get_progress(user_id: UUID, job_fingerprint: str) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, user_id, job_fingerprint, simplified_job, interview_questions, progress, updated_at
            FROM interview_prep_sessions
            WHERE user_id = %s AND job_fingerprint = %s
            """,
            (str(user_id), job_fingerprint),
        )
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def list_sessions_for_user(user_id: UUID, *, limit: int = 48) -> list[dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id, user_id, job_fingerprint, simplified_job, updated_at
            FROM interview_prep_sessions
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


def delete_progress(user_id: UUID, job_fingerprint: str) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            DELETE FROM interview_prep_sessions
            WHERE user_id = %s AND job_fingerprint = %s
            """,
            (str(user_id), job_fingerprint),
        )
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except psycopg2.Error:
        conn.rollback()
        logger.exception("[PG interview_prep] delete_progress failed")
        raise
    finally:
        conn.close()


def upsert_progress(
    user_id: UUID,
    *,
    job_fingerprint: str,
    simplified_job: Optional[dict[str, Any]],
    interview_questions: list[str],
    progress: dict[str, Any],
) -> dict[str, Any]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO interview_prep_sessions (
                user_id, job_fingerprint, simplified_job, interview_questions, progress, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, now())
            ON CONFLICT (user_id, job_fingerprint) DO UPDATE SET
                simplified_job = COALESCE(
                    EXCLUDED.simplified_job,
                    interview_prep_sessions.simplified_job
                ),
                interview_questions = EXCLUDED.interview_questions,
                progress = EXCLUDED.progress,
                updated_at = now()
            RETURNING id, user_id, job_fingerprint, simplified_job, interview_questions, progress, updated_at
            """,
            (
                str(user_id),
                job_fingerprint,
                Json(simplified_job) if simplified_job is not None else None,
                Json(interview_questions),
                Json(progress),
            ),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            raise RuntimeError("interview_prep_sessions upsert returned no row.")
        return dict(row)
    except psycopg2.Error:
        conn.rollback()
        logger.exception("[PG interview_prep] upsert_progress failed")
        raise
    finally:
        conn.close()
