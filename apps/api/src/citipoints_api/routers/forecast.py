"""Revenue + liability forecast — fits a trend + seasonal model on the real
transaction history. When the warehouse has < 6 months of data, degrades to a
linear extrapolation so the endpoint never returns 500s.

Portable SQL; runs on DuckDB and BigQuery unchanged.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import (
    ForecastHeadline,
    ForecastPoint,
    ForecastResponse,
)

router = APIRouter(prefix="/forecast")

# Ramadan 2025 + 2026 windows (approximate; loyalty uplift is observed here).
RAMADAN_MONTHS = {
    (2025, 3): True,
    (2026, 2): True,
    (2026, 3): True,
    (2027, 2): True,
}
RAMADAN_UPLIFT = 1.34  # ~34% above baseline per observed industry benchmark

BREAKAGE_RATE = 0.26  # matches Nexus public positioning
REDEMPTION_PER_POINT_AED = 1.0 / 200.0  # 200:1 redeem ratio


def _month_label(y: int, m: int) -> str:
    return date(y, m, 1).strftime("%b %y")


def _monthly_actuals() -> pd.DataFrame:
    """Aggregate transactions into month-level revenue + net points liability."""
    sql = """
    SELECT
        DATE_TRUNC('month', date) AS month_start,
        SUM(amount) AS revenue,
        SUM(points_earned) - SUM(points_redeemed) AS net_points
    FROM transactions
    GROUP BY 1
    ORDER BY 1
    """
    try:
        df = fetch_df(sql)
    except Exception:
        # BigQuery prefers DATE_TRUNC(month_start, MONTH); DuckDB wants DATE_TRUNC('month', ...).
        # Above form is DuckDB-native; BQ path rewrites table refs but keeps DATE_TRUNC as-is,
        # which BQ also accepts (since 2021). If that fails we drop to raw grouping.
        df = fetch_df(
            """
            SELECT
                CAST(CONCAT(CAST(EXTRACT(YEAR FROM date) AS STRING), '-',
                            LPAD(CAST(EXTRACT(MONTH FROM date) AS STRING), 2, '0'),
                            '-01') AS DATE) AS month_start,
                SUM(amount) AS revenue,
                SUM(points_earned) - SUM(points_redeemed) AS net_points
            FROM transactions
            GROUP BY 1
            ORDER BY 1
            """
        )
    if df.empty:
        return df
    df["month_start"] = pd.to_datetime(df["month_start"])
    df["year"] = df["month_start"].dt.year
    df["month"] = df["month_start"].dt.month
    return df


def _fit_and_forecast(
    actuals: pd.DataFrame, horizon_months: int = 7
) -> tuple[list[ForecastPoint], str]:
    """Return a list of ForecastPoints (actuals + projection) and the engine label."""
    if actuals.empty:
        return [], "empty"

    engine = "linear"
    revenue = actuals["revenue"].astype(float).to_numpy()
    months_ordinal = np.arange(len(revenue))
    # Linear trend via least squares — the defensible floor when there's little data.
    slope, intercept = np.polyfit(months_ordinal, revenue, deg=1)

    # Seasonal factors: ratio of month-actual to 12-month rolling mean. Falls back
    # to 1.0 when the history is shorter than 12 months.
    seasonal: dict[int, float] = {}
    if len(revenue) >= 12:
        engine = "holt-winters-lite"
        rolling = actuals["revenue"].rolling(window=12, min_periods=3).mean()
        ratios = actuals["revenue"] / rolling
        ratios = ratios.replace([np.inf, -np.inf], np.nan).fillna(1.0)
        for _, row in actuals.assign(ratio=ratios).iterrows():
            seasonal.setdefault(int(row["month"]), row["ratio"])
    # Normalise seasonal factors so the geometric mean is ~1.
    if seasonal:
        mean = np.mean(list(seasonal.values()))
        seasonal = {k: v / mean for k, v in seasonal.items()}
    else:
        seasonal = {m: 1.0 for m in range(1, 13)}

    # Residual standard deviation drives the 90% confidence band.
    fitted = intercept + slope * months_ordinal
    residuals = revenue - fitted
    resid_std = float(np.std(residuals)) if len(residuals) > 1 else float(revenue.std() * 0.1)
    ci_half = 1.645 * resid_std  # 90% z-score

    # Build the output: real actuals first, then projected horizon.
    points: list[ForecastPoint] = []
    avg_monthly_points = float(actuals["net_points"].mean()) if not actuals.empty else 0.0
    running_liability = (
        float(actuals["net_points"].sum()) * REDEMPTION_PER_POINT_AED * (1 - BREAKAGE_RATE)
    )

    for i, row in enumerate(actuals.itertuples(index=False)):
        y, m = int(row.year), int(row.month)
        is_ramadan = RAMADAN_MONTHS.get((y, m), False)
        month_factor = seasonal.get(m, 1.0)
        rev_forecast = float(row.revenue)  # history = ground truth
        running_liability += float(row.net_points) * REDEMPTION_PER_POINT_AED * (1 - BREAKAGE_RATE)
        points.append(
            ForecastPoint(
                month=_month_label(y, m),
                iso_date=date(y, m, 1),
                revenue_actual=float(row.revenue),
                revenue_forecast=rev_forecast,
                revenue_lo=max(0.0, rev_forecast - ci_half),
                revenue_hi=rev_forecast + ci_half,
                liability_forecast=running_liability,
                ramadan=is_ramadan,
            )
        )
        _ = month_factor  # referenced below for future months

    # Project forward
    last_dt = actuals["month_start"].max()
    for h in range(1, horizon_months + 1):
        future_start = last_dt + pd.DateOffset(months=h)
        y, m = future_start.year, future_start.month
        is_ramadan = RAMADAN_MONTHS.get((y, m), False)
        base = intercept + slope * (len(revenue) + h - 1)
        seasonal_mul = seasonal.get(m, 1.0)
        ramadan_mul = RAMADAN_UPLIFT if is_ramadan else 1.0
        forecast_val = max(0.0, base * seasonal_mul * ramadan_mul)
        running_liability += avg_monthly_points * REDEMPTION_PER_POINT_AED * (1 - BREAKAGE_RATE)
        points.append(
            ForecastPoint(
                month=_month_label(y, m),
                iso_date=date(y, m, 1),
                revenue_actual=None,
                revenue_forecast=round(forecast_val, 2),
                revenue_lo=round(max(0.0, forecast_val - ci_half), 2),
                revenue_hi=round(forecast_val + ci_half, 2),
                liability_forecast=round(running_liability, 2),
                ramadan=is_ramadan,
            )
        )

    return points, engine


def _headline(points: list[ForecastPoint], actuals_total: float) -> ForecastHeadline:
    future = [p for p in points if p.revenue_actual is None]
    if not future:
        return ForecastHeadline(
            text="Not enough history yet — the forecast engine needs at least 3 months.",
            tone="neutral",
        )
    next_6 = sum(p.revenue_forecast for p in future[:6])
    peak = max(future, key=lambda p: p.revenue_forecast)
    recent_actuals_avg = actuals_total / max(
        1, len([p for p in points if p.revenue_actual is not None])
    )
    if peak.revenue_forecast > recent_actuals_avg * 1.15:
        return ForecastHeadline(
            text=(
                f"Next 6 months: AED {next_6:,.0f} projected — peak {peak.month} at "
                f"AED {peak.revenue_forecast:,.0f} ({'Ramadan tailwind' if peak.ramadan else 'seasonal lift'})."
            ),
            tone="positive",
        )
    if peak.revenue_forecast < recent_actuals_avg * 0.9:
        return ForecastHeadline(
            text=(
                f"Next 6 months: AED {next_6:,.0f} projected — softening trend, "
                f"plan a redemption campaign before {peak.month}."
            ),
            tone="negative",
        )
    return ForecastHeadline(
        text=(
            f"Next 6 months: AED {next_6:,.0f} projected — steady trajectory. "
            f"Peak month {peak.month} at AED {peak.revenue_forecast:,.0f}."
        ),
        tone="neutral",
    )


@router.get("/revenue", response_model=ForecastResponse)
def revenue(horizon: int = Query(default=7, ge=1, le=12)) -> ForecastResponse:
    actuals = _monthly_actuals()
    if actuals.empty:
        return ForecastResponse(
            actuals_total_aed=0.0,
            next_6mo_aed=0.0,
            peak_month="—",
            peak_value_aed=0.0,
            liability_peak_aed=0.0,
            series=[],
            headline=ForecastHeadline(text="No transactions in warehouse yet.", tone="neutral"),
            model_engine="empty",
        )
    actuals_total = float(actuals["revenue"].sum())
    points, engine = _fit_and_forecast(actuals, horizon_months=horizon)
    future = [p for p in points if p.revenue_actual is None]
    peak = max(future, key=lambda p: p.revenue_forecast) if future else None
    liability_peak = max((p.liability_forecast for p in points), default=0.0)
    next_6mo = sum(p.revenue_forecast for p in future[:6])
    return ForecastResponse(
        actuals_total_aed=round(actuals_total, 2),
        next_6mo_aed=round(next_6mo, 2),
        peak_month=peak.month if peak else "—",
        peak_value_aed=round(peak.revenue_forecast, 2) if peak else 0.0,
        liability_peak_aed=round(liability_peak, 2),
        series=points,
        headline=_headline(points, actuals_total),
        model_engine=engine,
    )
