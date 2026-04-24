from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env next to the backend package so GEMINI_API_KEY loads even when
# uvicorn is started from the repo root (cwd would otherwise miss backend/.env).
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "NeuroGuide API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # Keep this as a *string* because pydantic-settings will otherwise try to JSON-decode
    # env vars for complex types (e.g. list[str]) and crash on comma-separated values.
    cors_origins: str = Field(
        default="https://neuroguide-rho.vercel.app,http://localhost:5173,http://127.0.0.1:5173"
    )

    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"

    # Where the anonymous Career Profile SQLite DB lives. Override with the
    # PROFILE_STORE_PATH env var in deployments that need a writable volume.
    profile_store_path: Path = Field(default=_BACKEND_ROOT / "data" / "profiles.db")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def normalize_cors_origins(cls, v: object) -> str:
        if v is None:
            return ""
        if isinstance(v, str):
            return v
        if isinstance(v, (list, tuple, set)):
            return ",".join(str(item).strip() for item in v if str(item).strip())
        return str(v)

    @property
    def cors_origins_list(self) -> list[str]:
        items = [item.strip() for item in self.cors_origins.split(",")]
        return [item for item in items if item]

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def empty_key_to_none(cls, v: object) -> Optional[str]:
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
