"""SQLite-backed store for anonymous career profiles.

We intentionally do not collect any personal information: the only identifier is
an 8-character server-generated random code (e.g. ``K7X2-M4QR``). The profile
payload itself is whatever the frontend wizard produces (roles, skills, ADHD
profile type, supports, etc.) serialised as JSON.

The database file lives at ``backend/data/profiles.db`` by default and is
created on demand. SQLite is chosen over plain JSON files because it gives us
atomic writes, concurrent read safety, and a single file that is easy to back
up or move between environments.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Alphabet for the profile ID. Ambiguous-looking characters (0/O, 1/I/L) are
# removed so a user who writes the code on paper can still read it back.
_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_ID_RAW_LENGTH = 8  # 32^8 ≈ 1.1e12 distinct IDs.
_MAX_COLLISION_RETRIES = 8

# Hard cap on stored payload size to stop a caller from uploading megabytes of
# JSON by accident. The actual wizard payload is well under 10 KB.
_MAX_PROFILE_BYTES = 256 * 1024


class ProfileStoreError(Exception):
    """Raised for any logical issue (not-found, too-large, etc.)."""


class ProfileNotFoundError(ProfileStoreError):
    """Raised when a lookup fails to find the requested profile id."""


class ProfileTooLargeError(ProfileStoreError):
    """Raised when a caller tries to persist an oversized profile payload."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _generate_raw_id() -> str:
    return "".join(secrets.choice(_ID_ALPHABET) for _ in range(_ID_RAW_LENGTH))


def format_profile_id(raw_id: str) -> str:
    """Return the human-facing ``XXXX-XXXX`` form of an ID."""
    raw = raw_id.strip().upper()
    if len(raw) != _ID_RAW_LENGTH:
        return raw
    return f"{raw[:4]}-{raw[4:]}"


def normalize_profile_id(user_input: str) -> str:
    """Strip formatting / whitespace and upper-case to the canonical raw form."""
    cleaned = "".join(ch for ch in (user_input or "").upper() if ch.isalnum())
    return cleaned


def is_valid_id_shape(raw_id: str) -> bool:
    """Check a raw ID against the alphabet before hitting the DB."""
    if len(raw_id) != _ID_RAW_LENGTH:
        return False
    return all(ch in _ID_ALPHABET for ch in raw_id)


class ProfileStore:
    """Thread-safe wrapper around a small SQLite DB.

    A single :class:`ProfileStore` is shared across the FastAPI process via
    :func:`get_profile_store` so we only pay the connection setup cost once.
    """

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS profiles (
                    id          TEXT PRIMARY KEY,
                    profile     TEXT NOT NULL,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                )
                """
            )

    # --- Public API ---------------------------------------------------------

    def create(self, profile: dict[str, Any]) -> dict[str, Any]:
        payload = self._serialize(profile)
        now = _now_iso()
        with self._lock, self._connect() as conn:
            for _ in range(_MAX_COLLISION_RETRIES):
                raw_id = _generate_raw_id()
                try:
                    conn.execute(
                        "INSERT INTO profiles (id, profile, created_at, updated_at)"
                        " VALUES (?, ?, ?, ?)",
                        (raw_id, payload, now, now),
                    )
                    return {
                        "id": format_profile_id(raw_id),
                        "raw_id": raw_id,
                        "profile": profile,
                        "created_at": now,
                        "updated_at": now,
                    }
                except sqlite3.IntegrityError:
                    continue
        raise ProfileStoreError("Could not allocate a unique profile id; try again.")

    def get(self, raw_id: str) -> dict[str, Any]:
        if not is_valid_id_shape(raw_id):
            raise ProfileNotFoundError("Profile id is malformed.")
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT id, profile, created_at, updated_at FROM profiles WHERE id = ?",
                (raw_id,),
            ).fetchone()
        if row is None:
            raise ProfileNotFoundError(f"No profile with id {format_profile_id(raw_id)}.")
        return {
            "id": format_profile_id(row["id"]),
            "raw_id": row["id"],
            "profile": json.loads(row["profile"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def update(self, raw_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        if not is_valid_id_shape(raw_id):
            raise ProfileNotFoundError("Profile id is malformed.")
        payload = self._serialize(profile)
        now = _now_iso()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE profiles SET profile = ?, updated_at = ? WHERE id = ?",
                (payload, now, raw_id),
            )
            if cur.rowcount == 0:
                raise ProfileNotFoundError(f"No profile with id {format_profile_id(raw_id)}.")
            row = conn.execute(
                "SELECT id, profile, created_at, updated_at FROM profiles WHERE id = ?",
                (raw_id,),
            ).fetchone()
        return {
            "id": format_profile_id(row["id"]),
            "raw_id": row["id"],
            "profile": json.loads(row["profile"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # --- Helpers ------------------------------------------------------------

    @staticmethod
    def _serialize(profile: dict[str, Any]) -> str:
        if not isinstance(profile, dict):
            raise ProfileStoreError("Profile must be a JSON object.")
        payload = json.dumps(profile, ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode("utf-8")) > _MAX_PROFILE_BYTES:
            raise ProfileTooLargeError(
                f"Profile payload exceeds {_MAX_PROFILE_BYTES // 1024} KB."
            )
        return payload


# Singleton lookup used from request handlers via FastAPI dependencies.
_store: Optional[ProfileStore] = None
_store_lock = threading.Lock()


def get_profile_store(db_path: Path) -> ProfileStore:
    """Return (or lazily create) the process-wide :class:`ProfileStore`."""
    global _store
    if _store is not None and _store._db_path == db_path:
        return _store
    with _store_lock:
        if _store is None or _store._db_path != db_path:
            _store = ProfileStore(db_path)
    return _store
