"""Shared PostgreSQL connections for RDS and local Postgres."""

from __future__ import annotations

import psycopg2
from psycopg2.extensions import connection as PGConnection

from app.core.config import get_settings


def get_db_connection() -> PGConnection:
    """Open a new connection using ``DATABASE_URL`` from settings."""
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. Add it to your .env file.")
    return psycopg2.connect(str(settings.database_url))
