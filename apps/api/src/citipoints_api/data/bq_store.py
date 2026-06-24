"""BigQuery adapter for the analytics store.

Drop-in replacement for the DuckDB `fetch_df()` path. Activated by
`USE_BIGQUERY=1` in the environment. The adapter rewrites DuckDB-style
named parameters (`$name`) to BigQuery-style (`@name`) and infers scalar
query-parameter types from Python values.

Authentication uses Application Default Credentials (ADC) — set
`GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` in the
environment OR run `gcloud auth application-default login` for local dev.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from google.cloud import bigquery  # type: ignore[attr-defined]
from google.cloud.bigquery.query import ScalarQueryParameter

from citipoints_api.config import get_settings
from citipoints_api.logging_conf import get_logger

if TYPE_CHECKING:
    import pandas as pd

logger = get_logger(__name__)

_LOCK = threading.Lock()
_CLIENT: bigquery.Client | None = None


def get_bq_client() -> bigquery.Client:
    """Process-wide BigQuery client. Uses ADC auth by default."""
    global _CLIENT
    with _LOCK:
        if _CLIENT is None:
            settings = get_settings()
            project = settings.gbq_project or None  # let ADC infer project if blank
            _CLIENT = bigquery.Client(project=project)
            logger.info(
                "bigquery.connected",
                project=_CLIENT.project,
                dataset=settings.gbq_dataset,
            )
        return _CLIENT


def close_bq_client() -> None:
    global _CLIENT
    with _LOCK:
        if _CLIENT is not None:
            _CLIENT.close()
            _CLIENT = None


# ── Parameter translation ───────────────────────────────────────────
# DuckDB uses $name-style params. BigQuery uses @name with typed
# ScalarQueryParameter. We translate at query time so every router can
# stay unchanged.

_PARAM_PATTERN = re.compile(r"\$([a-zA-Z_][a-zA-Z0-9_]*)")


def _infer_param_type(value: Any) -> str:
    if isinstance(value, bool):
        return "BOOL"
    if isinstance(value, int):
        return "INT64"
    if isinstance(value, float):
        return "FLOAT64"
    # Dates arrive as ISO strings (YYYY-MM-DD) — BigQuery DATE is a
    # valid cast target from STRING so keep params as STRING unless
    # caller explicitly uses a date.
    return "STRING"


def _to_bq_sql(sql: str) -> str:
    """Swap `$name` → `@name` for BigQuery parameter binding."""
    return _PARAM_PATTERN.sub(r"@\1", sql)


def _translate_table_refs(sql: str, project: str, dataset: str) -> str:
    """Prefix bare table names with `project.dataset.` so BigQuery routes them.

    Only prefixes when the table identifier stands alone (e.g. `FROM transactions`
    or `JOIN customers c`) — leaves already-qualified references intact.
    """
    # Bare 3-table vocabulary used by the MVP. Keep this list explicit so we
    # don't accidentally prefix column names or alias identifiers.
    tables = ("transactions", "customers", "skus")
    for tbl in tables:
        # Word-boundary match; do not rewrite already-qualified names
        sql = re.sub(
            rf"\b(FROM|JOIN)\s+{tbl}\b(?!\.)",
            rf"\1 `{project}.{dataset}.{tbl}`",
            sql,
            flags=re.IGNORECASE,
        )
    return sql


# ── Public API ──────────────────────────────────────────────────────


def fetch_df_bq(sql: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    """Execute ``sql`` on BigQuery and return a pandas DataFrame.

    Drop-in replacement for the DuckDB `fetch_df()` so routers call one
    function regardless of the backend.
    """
    settings = get_settings()
    client = get_bq_client()
    translated = _to_bq_sql(sql)
    translated = _translate_table_refs(
        translated,
        project=client.project,
        dataset=settings.gbq_dataset,
    )

    job_config = None
    if params:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                ScalarQueryParameter(name, _infer_param_type(value), value)
                for name, value in params.items()
            ],
        )

    job = client.query(translated, job_config=job_config)
    return job.result().to_dataframe(create_bqstorage_client=False)


def table_counts_bq() -> dict[str, int]:
    """Used by the /ready health check. Returns row-count per core table."""
    settings = get_settings()
    client = get_bq_client()
    out: dict[str, int] = {}
    for table in ("skus", "customers", "transactions"):
        q = f"SELECT COUNT(*) AS n FROM `{client.project}.{settings.gbq_dataset}.{table}`"
        row = next(iter(client.query(q).result()), None)
        out[table] = int(row["n"]) if row else 0
    return out


def date_bounds_bq() -> tuple[str, str]:
    settings = get_settings()
    client = get_bq_client()
    q = (
        f"SELECT MIN(date) AS lo, MAX(date) AS hi "
        f"FROM `{client.project}.{settings.gbq_dataset}.transactions`"
    )
    row = next(iter(client.query(q).result()), None)
    if row is None or row["lo"] is None:
        return ("", "")
    return (str(row["lo"]), str(row["hi"]))


@dataclass(frozen=True)
class BqHealth:
    project: str
    dataset: str
    tables_found: list[str]
    tables_missing: list[str]


def health_check_bq() -> BqHealth:
    """Verify credentials + the three MVP tables exist. Called at /ready."""
    settings = get_settings()
    client = get_bq_client()
    dataset_ref = f"{client.project}.{settings.gbq_dataset}"
    required = {"transactions", "customers", "skus"}
    found: list[str] = []
    missing: list[str] = []
    try:
        for t in client.list_tables(dataset_ref):
            if t.table_id in required:
                found.append(t.table_id)
        missing = sorted(required - set(found))
    except Exception as exc:  # pragma: no cover — surfaces on credential failure
        logger.warning("bigquery.health_check_failed", error=str(exc))
        missing = sorted(required)
    return BqHealth(
        project=client.project,
        dataset=settings.gbq_dataset,
        tables_found=sorted(found),
        tables_missing=missing,
    )
