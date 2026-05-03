"""Database helpers (PostgreSQL via psycopg2)."""

from app.db.postgres import get_db_connection

__all__ = ["get_db_connection"]
