"""Shared pytest fixtures — seed a tiny demo database once per session."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

# Point the API at an isolated tmp dir before importing the app
_TEST_ROOT = Path(__file__).resolve().parent
_TMP_DIR = _TEST_ROOT / ".tmp-data"
_TMP_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("DATA_DIR", str(_TMP_DIR))
os.environ.setdefault("DUCKDB_PATH", str(_TMP_DIR / "citipoints.duckdb"))
os.environ.setdefault("ARTIFACTS_DIR", str(_TMP_DIR / "artifacts"))
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("CLAUDE_CLI_PATH", "/bin/false")  # force fallback path in chat tests


@pytest.fixture(scope="session", autouse=True)
def _seed_once():
    from citipoints_api.config import get_settings
    from citipoints_api.data.seed import run
    from citipoints_api.data.store import bootstrap_duckdb

    get_settings.cache_clear()
    settings = get_settings()
    run(customers_n=500, transactions_n=4000, data_dir=settings.data_dir, seed=7)
    bootstrap_duckdb(settings.duckdb_path, settings.data_dir)
    yield
