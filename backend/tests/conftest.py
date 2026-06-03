"""Shared pytest fixtures for authenticated API tests."""

from __future__ import annotations

import pytest

from app.core.config import get_settings

TEST_USER_ID = "8d95e89d-61b4-4089-8b84-a62ed22d24bf"
TEST_PASS_KEY = "test-pass-key"


@pytest.fixture(autouse=True)
def _session_auth_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enable session header checks in unit tests without a real database."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
    monkeypatch.setenv("PASS_KEY_PEPPER", "unit-test-pepper-not-for-production")
    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.services.pg_session.verify_pass_key",
        lambda user_id, pass_key: str(user_id) == TEST_USER_ID and pass_key == TEST_PASS_KEY,
    )
    yield
    get_settings.cache_clear()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-NG-User-Id": TEST_USER_ID,
        "X-NG-Pass-Key": TEST_PASS_KEY,
    }
