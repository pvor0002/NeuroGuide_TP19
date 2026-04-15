from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env next to the backend package so GEMINI_API_KEY loads even when
# uvicorn is started from the repo root (cwd would otherwise miss backend/.env).
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "NeuroGuide API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def empty_key_to_none(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v if isinstance(v, str) else str(v)

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.is_file() else ".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
