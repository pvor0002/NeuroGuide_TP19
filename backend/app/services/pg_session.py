"""Register, login, sync, and teardown for browser users backed by RDS."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

from app.core.config import get_settings
from app.db.postgres import get_db_connection
from app.services.pass_key_crypto import hash_pass_key

logger = logging.getLogger(__name__)


def _require_pepper() -> str:
    s = get_settings().pass_key_pepper
    if not s or not str(s).strip():
        raise RuntimeError("PASS_KEY_PEPPER is not set — cannot use session endpoints.")
    return str(s).strip()


def _digest(pass_key: str) -> str:
    return hash_pass_key(_require_pepper(), pass_key)


def verify_pass_key(user_id: UUID, pass_key: str) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT 1 FROM user_credentials
            WHERE user_id = %s AND pass_key_hash = %s
            """,
            (str(user_id), _digest(pass_key)),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


def resolve_user_id_by_pass_key(pass_key: str) -> Optional[UUID]:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id FROM user_credentials WHERE pass_key_hash = %s",
            (_digest(pass_key),),
        )
        row = cur.fetchone()
        if not row:
            return None
        return UUID(str(row[0]))
    finally:
        conn.close()


def _normalize_json(value: Any) -> Optional[dict[str, Any]]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def register_account(
    user_id: UUID,
    pass_key: str,
    *,
    consent: dict[str, Any],
    career_wizard: Optional[dict[str, Any]],
    job_workbench: Optional[dict[str, Any]],
) -> dict[str, Any]:
    digest = _digest(pass_key)
    granted = bool(consent.get("status") == "accepted")

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO users (id) VALUES (%s)", (str(user_id),))
        cur.execute(
            "INSERT INTO user_credentials (user_id, pass_key_hash) VALUES (%s, %s)",
            (str(user_id), digest),
        )
        cur.execute(
            """
            INSERT INTO consent_records (user_id, consent_granted, consent_json, updated_at)
            VALUES (%s, %s, %s, now())
            """,
            (str(user_id), granted, Json(consent)),
        )
        if career_wizard is not None:
            cur.execute(
                "INSERT INTO career_profiles (user_id, profile) VALUES (%s, %s)",
                (str(user_id), Json(career_wizard)),
            )
        if job_workbench is not None:
            cur.execute(
                "INSERT INTO job_workbench_state (user_id, state) VALUES (%s, %s)",
                (str(user_id), Json(job_workbench)),
            )
        conn.commit()
        return fetch_snapshot(user_id)
    except psycopg2.Error:
        conn.rollback()
        logger.exception("[PG session] register_account failed")
        raise
    finally:
        conn.close()


def fetch_snapshot(user_id: UUID) -> dict[str, Any]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT created_at FROM users WHERE id = %s", (str(user_id),))
        urow = cur.fetchone()
        user_created_at = urow["created_at"] if urow else None

        cur.execute(
            """
            SELECT consent_granted, consent_json
            FROM consent_records
            WHERE user_id = %s
            """,
            (str(user_id),),
        )
        crow = cur.fetchone()
        consent_granted = bool(crow["consent_granted"]) if crow else False
        raw_cj = crow["consent_json"] if crow else None
        consent_json = _normalize_json(raw_cj) if raw_cj is not None else None

        cur.execute(
            """
            SELECT profile FROM career_profiles
            WHERE user_id = %s
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
            """,
            (str(user_id),),
        )
        prow = cur.fetchone()
        career_profile = _normalize_json(prow["profile"]) if prow else None

        cur.execute(
            "SELECT state FROM job_workbench_state WHERE user_id = %s",
            (str(user_id),),
        )
        jrow = cur.fetchone()
        job_state = _normalize_json(jrow["state"]) if jrow else None

        return {
            "user_id": user_id,
            "user_created_at": user_created_at,
            "consent_granted": consent_granted,
            "consent": consent_json,
            "career_profile": career_profile,
            "job_workbench": job_state,
        }
    finally:
        conn.close()


def full_sync(
    user_id: UUID,
    *,
    consent: Optional[dict[str, Any]],
    career_wizard: Optional[dict[str, Any]],
    job_workbench: Optional[dict[str, Any]],
) -> dict[str, Any]:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        if consent is not None:
            granted = bool(consent.get("status") == "accepted")
            cur.execute("DELETE FROM consent_records WHERE user_id = %s", (str(user_id),))
            cur.execute(
                """
                INSERT INTO consent_records (user_id, consent_granted, consent_json, updated_at)
                VALUES (%s, %s, %s, now())
                """,
                (str(user_id), granted, Json(consent)),
            )
        if career_wizard is not None:
            cur.execute("DELETE FROM career_profiles WHERE user_id = %s", (str(user_id),))
            cur.execute(
                "INSERT INTO career_profiles (user_id, profile) VALUES (%s, %s)",
                (str(user_id), Json(career_wizard)),
            )
        if job_workbench is not None:
            cur.execute("DELETE FROM job_workbench_state WHERE user_id = %s", (str(user_id),))
            cur.execute(
                "INSERT INTO job_workbench_state (user_id, state) VALUES (%s, %s)",
                (str(user_id), Json(job_workbench)),
            )
        conn.commit()
        return fetch_snapshot(user_id)
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def patch_consent_only(user_id: UUID, consent_granted: bool, consent: dict[str, Any]) -> None:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM consent_records WHERE user_id = %s", (str(user_id),))
        cur.execute(
            """
            INSERT INTO consent_records (user_id, consent_granted, consent_json, updated_at)
            VALUES (%s, %s, %s, now())
            """,
            (str(user_id), consent_granted, Json(consent)),
        )
        conn.commit()
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_career_data_only(user_id: UUID) -> None:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM career_profiles WHERE user_id = %s", (str(user_id),))
        conn.commit()
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_all_user_rows(user_id: UUID) -> None:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM career_profiles WHERE user_id = %s", (str(user_id),))
        cur.execute("DELETE FROM job_workbench_state WHERE user_id = %s", (str(user_id),))
        cur.execute("DELETE FROM consent_records WHERE user_id = %s", (str(user_id),))
        cur.execute("DELETE FROM user_credentials WHERE user_id = %s", (str(user_id),))
        cur.execute("DELETE FROM users WHERE id = %s", (str(user_id),))
        conn.commit()
    except psycopg2.Error:
        conn.rollback()
        raise
    finally:
        conn.close()
