"""DuckDB-backed analytics store. BigQuery adapter is swappable."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import duckdb

from citipoints_api.config import get_settings
from citipoints_api.logging_conf import get_logger

if TYPE_CHECKING:
    import pandas as pd

logger = get_logger(__name__)
_LOCK = threading.Lock()
_CONNECTION: duckdb.DuckDBPyConnection | None = None


SCHEMA_DDL = """
CREATE TABLE IF NOT EXISTS skus (
    sku_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    brand TEXT NOT NULL,
    product_name TEXT NOT NULL,
    base_price DOUBLE NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT,
    age INTEGER,
    tier TEXT NOT NULL,
    join_date DATE NOT NULL,
    city TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    date DATE NOT NULL,
    store TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    category TEXT NOT NULL,
    units INTEGER NOT NULL,
    amount DOUBLE NOT NULL,
    points_earned INTEGER NOT NULL,
    points_redeemed INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_txn_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_txn_store ON transactions(store);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_sku ON transactions(sku_id);
"""


@dataclass(frozen=True)
class FilterParams:
    """Common filter parameters shared across endpoints."""

    store: str | None = None
    category: str | None = None
    tier: str | None = None
    date_from: str | None = None
    date_to: str | None = None

    def where_clause(self) -> tuple[str, dict[str, Any]]:
        """Return a SQL WHERE snippet and a params dict (duckdb uses named params)."""
        clauses: list[str] = []
        params: dict[str, Any] = {}
        if self.store:
            clauses.append("t.store = $store")
            params["store"] = self.store
        if self.category:
            clauses.append("t.category = $category")
            params["category"] = self.category
        if self.tier:
            clauses.append("c.tier = $tier")
            params["tier"] = self.tier
        if self.date_from:
            clauses.append("t.date >= $date_from")
            params["date_from"] = self.date_from
        if self.date_to:
            clauses.append("t.date <= $date_to")
            params["date_to"] = self.date_to
        sql = (" AND " + " AND ".join(clauses)) if clauses else ""
        return sql, params


def _connect(duckdb_path: Path) -> duckdb.DuckDBPyConnection:
    duckdb_path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(duckdb_path), read_only=False)
    conn.execute(SCHEMA_DDL)
    return conn


def get_conn() -> duckdb.DuckDBPyConnection:
    """Return (and cache) the process-wide DuckDB connection."""
    global _CONNECTION
    with _LOCK:
        if _CONNECTION is None:
            settings = get_settings()
            _CONNECTION = _connect(settings.duckdb_path)
            logger.info("duckdb.connected", path=str(settings.duckdb_path))
        return _CONNECTION


def close_conn() -> None:
    """Close whichever backend is active. Safe to call on shutdown even if
    neither adapter opened a connection (idempotent)."""
    global _CONNECTION
    with _LOCK:
        if _CONNECTION is not None:
            _CONNECTION.close()
            _CONNECTION = None
    if get_settings().use_bigquery:
        from citipoints_api.data.bq_store import close_bq_client

        close_bq_client()


def warm_backend() -> None:
    """Open the active backend connection during FastAPI lifespan startup.
    DuckDB reads the `.duckdb` file; BigQuery creates an authenticated client
    (ADC or GOOGLE_APPLICATION_CREDENTIALS)."""
    if get_settings().use_bigquery:
        from citipoints_api.data.bq_store import get_bq_client

        get_bq_client()
    else:
        get_conn()


def bootstrap_duckdb(duckdb_path: Path, data_dir: Path) -> None:
    """Reload all three tables from CSV seed."""
    conn = _connect(duckdb_path)
    try:
        for table in ("transactions", "customers", "skus"):
            csv_path = data_dir / f"{table}.csv"
            if not csv_path.exists():
                raise FileNotFoundError(f"Missing seed file: {csv_path}")
            conn.execute(f"DELETE FROM {table}")
            conn.execute(
                f"INSERT INTO {table} SELECT * FROM read_csv_auto(?, header=true)",
                [str(csv_path)],
            )
        counts = {
            "skus": conn.execute("SELECT COUNT(*) FROM skus").fetchone()[0],
            "customers": conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
            "transactions": conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
        }
        logger.info("duckdb.bootstrap_complete", **counts)
    finally:
        conn.close()


def fetch_df(sql: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    """Execute ``sql`` and return a pandas DataFrame.

    Routes to DuckDB (demo) or BigQuery (prod) based on the `USE_BIGQUERY`
    environment flag. Routers stay engine-agnostic — they call `fetch_df`
    and the adapter translates params + table references as needed.

    DuckDB path: connections are *not* safe for concurrent execution from
    multiple threads, so we take a fresh cursor per call. Cursors share the
    underlying DB but carry their own execution state, which eliminates the
    ``unique_ptr NULL`` crashes we saw under concurrent RFM / chat requests.
    """
    settings = get_settings()
    if settings.use_bigquery:
        # Imported lazily so dev/demo setups without google-cloud-bigquery
        # credentials don't crash at import time.
        from citipoints_api.data.bq_store import fetch_df_bq

        return fetch_df_bq(sql, params)

    conn = get_conn()
    cursor = conn.cursor()
    try:
        if params:
            return cursor.execute(sql, params).df()
        return cursor.execute(sql).df()
    finally:
        cursor.close()


def table_counts() -> dict[str, int]:
    if get_settings().use_bigquery:
        from citipoints_api.data.bq_store import table_counts_bq

        return table_counts_bq()

    conn = get_conn()
    cursor = conn.cursor()
    try:
        return {
            "skus": cursor.execute("SELECT COUNT(*) FROM skus").fetchone()[0],
            "customers": cursor.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
            "transactions": cursor.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
        }
    finally:
        cursor.close()


def date_bounds() -> tuple[str, str]:
    if get_settings().use_bigquery:
        from citipoints_api.data.bq_store import date_bounds_bq

        return date_bounds_bq()

    conn = get_conn()
    cursor = conn.cursor()
    try:
        row = cursor.execute("SELECT MIN(date), MAX(date) FROM transactions").fetchone()
    finally:
        cursor.close()
    if row is None or row[0] is None:
        return ("", "")
    return (str(row[0]), str(row[1]))
