"""CRUD helpers for the ``users`` table."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

import psycopg2
import psycopg2.extras

from app.db.postgres import get_db_connection

logger = logging.getLogger(__name__)


def create_user(explicit_id: Optional[UUID]) -> dict:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if explicit_id is not None:
            cursor.execute(
                """
                INSERT INTO users (id)
                VALUES (%s)
                RETURNING id, created_at
                """,
                (str(explicit_id),),
            )
        else:
            cursor.execute(
                """
                INSERT INTO users (id)
                VALUES (gen_random_uuid())
                RETURNING id, created_at
                """
            )
        row = cursor.fetchone()
        conn.commit()
        return dict(row) if row else {}
    except psycopg2.Error as exc:
        conn.rollback()
        logger.warning("[PG users] create_user failed: %s", exc)
        raise
    finally:
        conn.close()


def get_user(user_id: UUID) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            "SELECT id, created_at FROM users WHERE id = %s",
            (str(user_id),),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_user(user_id: UUID) -> bool:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = %s", (str(user_id),))
        deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()
