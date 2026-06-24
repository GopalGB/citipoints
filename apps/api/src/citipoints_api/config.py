"""Application configuration loaded from environment."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings for the analytics API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Data layer
    use_bigquery: bool = Field(default=False, alias="USE_BIGQUERY")
    data_dir: Path = Field(default=Path("./data"), alias="DATA_DIR")
    duckdb_path: Path = Field(default=Path("./data/citipoints.duckdb"), alias="DUCKDB_PATH")
    gbq_project: str = Field(default="", alias="GBQ_PROJECT")
    gbq_dataset: str = Field(default="loyalty_analytics", alias="GBQ_DATASET")

    # AI Chat — shells out to the Claude Code CLI binary
    claude_cli_path: str = Field(default="claude", alias="CLAUDE_CLI_PATH")
    claude_cli_model: str = Field(default="claude-sonnet-4-5", alias="CLAUDE_CLI_MODEL")
    # 22s keeps the whole chat round-trip under the Next.js rewrite proxy's
    # ~30s default undici headersTimeout. If the CLI is slow, we fall back
    # gracefully rather than letting the proxy 500 on us.
    claude_cli_timeout_seconds: int = Field(default=22, alias="CLAUDE_CLI_TIMEOUT")
    claude_cli_max_tokens: int = Field(default=2000, alias="CLAUDE_CLI_MAX_TOKENS")

    # HTTP — stored as CSV string; exposed as list[str] via computed field to
    # avoid pydantic-settings attempting to JSON-parse the env value.
    cors_origins_raw: str = Field(
        default="http://localhost:3000",
        alias="CORS_ORIGINS",
    )
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Model training (seeded once per boot, cached on disk)
    artifacts_dir: Path = Field(default=Path("./artifacts"), alias="ARTIFACTS_DIR")

    # Business params (can be overridden per request)
    market_basket_min_support: float = Field(default=0.02, alias="MB_MIN_SUPPORT")
    market_basket_min_confidence: float = Field(default=0.30, alias="MB_MIN_CONFIDENCE")
    rfm_n_clusters: int = Field(default=5, alias="RFM_N_CLUSTERS")
    churn_threshold_days: int = Field(default=60, alias="CHURN_THRESHOLD_DAYS")
    clv_months_ahead: int = Field(default=12, alias="CLV_MONTHS_AHEAD")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @field_validator("data_dir", "duckdb_path", "artifacts_dir")
    @classmethod
    def resolve_path(cls, value: Path) -> Path:
        return value.expanduser().resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
