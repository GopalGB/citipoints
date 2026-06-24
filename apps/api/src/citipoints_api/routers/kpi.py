"""Headline KPI tiles for the Home page."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from citipoints_api.data.filters import parse_filters
from citipoints_api.data.store import FilterParams
from citipoints_api.schemas import KpiResponse, KpiTile, SparkPoint
from citipoints_api.services import queries

router = APIRouter()


def _format_aed(value: float) -> str:
    return f"AED {value:,.0f}"


def _format_int(value: float) -> str:
    return f"{int(value):,}"


def _format_pct(value: float) -> str:
    return f"{value:.1f}%"


def _format_decimal(value: float) -> str:
    return f"{value:.1f}"


def _format_basket(value: float) -> str:
    return f"AED {value:,.2f}"


def _delta(current: float, previous: float) -> tuple[float | None, str]:
    if previous == 0 or previous is None:
        return (None, "flat")
    delta_pct = ((current - previous) / previous) * 100
    if delta_pct > 0.5:
        return (delta_pct, "up")
    if delta_pct < -0.5:
        return (delta_pct, "down")
    return (delta_pct, "flat")


def _sentiment(delta_dir: str, higher_is_better: bool) -> str:
    if delta_dir == "flat":
        return "neutral"
    if higher_is_better:
        return "positive" if delta_dir == "up" else "negative"
    return "negative" if delta_dir == "up" else "positive"


def _spark(filters: FilterParams, metric: str, buckets: int = 14) -> list[SparkPoint]:
    return [SparkPoint(x=x, y=y) for x, y in queries.sparkline(filters, metric, buckets)]


@router.get("/kpi", response_model=KpiResponse)
def get_kpis(filters: FilterParams = Depends(parse_filters)) -> KpiResponse:
    """Return the 8 headline KPI tiles with WoW deltas and sparklines."""
    current = queries.kpi_snapshot(filters)
    previous = queries.kpi_prev_snapshot(filters)
    spark_rev = _spark(filters, "revenue")
    spark_txn = _spark(filters, "transactions")

    tiles: list[KpiTile] = []

    for key, label, formatter, higher_better in [
        ("revenue", "Total Revenue", _format_aed, True),
        ("transactions", "Transactions", _format_int, True),
        ("active_members", "Active Members", _format_int, True),
        ("avg_basket", "Avg Basket", _format_basket, True),
        ("points_earned", "Points Earned", _format_int, True),
        ("points_redeemed", "Points Redeemed", _format_int, True),
        ("redemption_rate", "Redemption Rate", _format_pct, True),
        ("avg_units_per_txn", "Avg Units/Txn", _format_decimal, True),
    ]:
        current_val = current.get(key, 0.0)
        prev_val = previous.get(key, 0.0)
        delta_pct, direction = _delta(current_val, prev_val)
        trend = spark_rev if key in {"revenue", "avg_basket"} else spark_txn
        tiles.append(
            KpiTile(
                id=key,
                label=label,
                value=current_val,
                value_display=formatter(current_val),
                delta_pct=delta_pct,
                delta_direction=direction,
                trend=trend,
                sentiment=_sentiment(direction, higher_better),
            ),
        )

    return KpiResponse(
        period_label=_period_label(filters),
        generated_at=datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        tiles=tiles,
    )


def _period_label(filters: FilterParams) -> str:
    if filters.date_from and filters.date_to:
        return f"{filters.date_from} → {filters.date_to}"
    if filters.date_from:
        return f"from {filters.date_from}"
    if filters.date_to:
        return f"through {filters.date_to}"
    return "All time (demo)"
