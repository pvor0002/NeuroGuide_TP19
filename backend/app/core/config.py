import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "NeuroGuide API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False

    cors_origins: str = Field(
        default="https://www.neuroguide.dev,http://localhost:5173,http://127.0.0.1:5173"
    )

    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"

    profile_store_path: Path = Field(default=_BACKEND_ROOT / "data" / "profiles.db")

    # PostgreSQL — injected by Lambda environment
    database_url: Optional[str] = None

    # HMAC secret for storing pass keys (set in production; required for /pg/session/*)
    pass_key_pepper: Optional[str] = None

    # S3
    s3_bucket_name: Optional[str] = None
    aws_region: str = "ap-southeast-2"

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

    @property
    def use_postgres(self) -> bool:
        return bool(self.database_url)

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.is_file() else ".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    logger.info(
        "[Config] Settings loaded — model=%s, gemini_key_set=%s, cors_origins=%s, "
        "database_url_set=%s, profile_store_path=%s",
        s.gemini_model,
        bool(s.gemini_api_key),
        s.cors_origins,
        bool(s.database_url),
        s.profile_store_path,
    )
    return s