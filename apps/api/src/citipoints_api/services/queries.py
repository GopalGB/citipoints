"""Pure SQL helpers used by routers — keeps route handlers thin and testable."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pandas as pd

from citipoints_api.data.store import FilterParams, fetch_df


def _build_filtered_transactions_cte(filters: FilterParams) -> tuple[str, dict[str, Any]]:
    where, params = filters.where_clause()
    cte = f"""
    WITH ftx AS (
        SELECT t.*, c.tier AS customer_tier
        FROM transactions t
        JOIN customers c USING(customer_id)
        WHERE 1=1 {where}
    )
    """
    return cte, params


def kpi_snapshot(filters: FilterParams) -> dict[str, float]:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT
        COUNT(DISTINCT transaction_id)        AS transactions,
        COUNT(DISTINCT customer_id)           AS active_members,
        COALESCE(SUM(amount), 0)              AS revenue,
        COALESCE(SUM(points_earned), 0)       AS points_earned,
        COALESCE(SUM(points_redeemed), 0)     AS points_redeemed,
        COALESCE(SUM(units), 0)               AS units
    FROM ftx;
    """
    row = fetch_df(sql, params).iloc[0].to_dict()
    txns = float(row["transactions"] or 0)
    revenue = float(row["revenue"] or 0)
    units = float(row["units"] or 0)
    points_earned = float(row["points_earned"] or 0)
    points_redeemed = float(row["points_redeemed"] or 0)
    return {
        "revenue": revenue,
        "transactions": txns,
        "active_members": float(row["active_members"] or 0),
        "avg_basket": revenue / txns if txns else 0.0,
        "points_earned": points_earned,
        "points_redeemed": points_redeemed,
        "redemption_rate": (points_redeemed / points_earned * 100) if points_earned else 0.0,
        "avg_units_per_txn": units / txns if txns else 0.0,
    }


def kpi_prev_snapshot(filters: FilterParams) -> dict[str, float]:
    """Compute the same KPIs for the prior-period comparison window."""
    lower, upper = _prev_window(filters)
    prev_filters = FilterParams(
        store=filters.store,
        category=filters.category,
        tier=filters.tier,
        date_from=lower,
        date_to=upper,
    )
    return kpi_snapshot(prev_filters)


def _prev_window(filters: FilterParams) -> tuple[str, str]:
    """Shift the filter window back by the same length (for WoW/period-over-period)."""
    end = datetime.fromisoformat(filters.date_to) if filters.date_to else datetime(2026, 3, 31)
    start = datetime.fromisoformat(filters.date_from) if filters.date_from else (end - timedelta(days=7))
    span = (end - start).days or 7
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span)
    return (prev_start.date().isoformat(), prev_end.date().isoformat())


def revenue_trend(filters: FilterParams) -> pd.DataFrame:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT
        date,
        SUM(amount)              AS revenue,
        COUNT(DISTINCT transaction_id) AS transactions
    FROM ftx
    GROUP BY date
    ORDER BY date;
    """
    return fetch_df(sql, params)


def sparkline(filters: FilterParams, metric: str, buckets: int = 14) -> list[tuple[str, float]]:
    df = revenue_trend(filters)
    if df.empty:
        return []
    if metric == "revenue":
        series = df.set_index("date")["revenue"]
    elif metric == "transactions":
        series = df.set_index("date")["transactions"]
    else:
        return []
    resampled = series.resample("D").sum().tail(buckets)
    return [(idx.date().isoformat(), float(val)) for idx, val in resampled.items()]


def category_mix(filters: FilterParams) -> pd.DataFrame:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT category, SUM(amount) AS revenue
    FROM ftx
    GROUP BY category
    ORDER BY revenue DESC;
    """
    df = fetch_df(sql, params)
    if df.empty:
        df["share_pct"] = []
        return df
    total = df["revenue"].sum()
    df["share_pct"] = (df["revenue"] / total * 100) if total else 0
    return df


def store_performance(filters: FilterParams) -> pd.DataFrame:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT
        store,
        SUM(amount)                         AS revenue,
        COUNT(DISTINCT transaction_id)       AS transactions
    FROM ftx
    GROUP BY store
    ORDER BY revenue DESC;
    """
    df = fetch_df(sql, params)
    if df.empty:
        df["avg_basket"] = []
        return df
    df["avg_basket"] = df["revenue"] / df["transactions"].where(df["transactions"] > 0, 1)
    return df


def tier_distribution(filters: FilterParams) -> pd.DataFrame:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT
        customer_tier AS tier,
        COUNT(DISTINCT customer_id) AS members,
        SUM(amount)                 AS revenue
    FROM ftx
    GROUP BY customer_tier
    ORDER BY
        CASE customer_tier
            WHEN 'Platinum' THEN 1
            WHEN 'Gold' THEN 2
            WHEN 'Silver' THEN 3
            WHEN 'Bronze' THEN 4
            ELSE 5
        END;
    """
    df = fetch_df(sql, params)
    if df.empty:
        df["share_pct"] = []
        return df
    total = df["revenue"].sum()
    df["share_pct"] = (df["revenue"] / total * 100) if total else 0
    return df


def top_products(filters: FilterParams, limit: int = 10) -> pd.DataFrame:
    cte, params = _build_filtered_transactions_cte(filters)
    params["lim"] = limit
    sql = f"""{cte}
    SELECT
        s.sku_id,
        s.product_name,
        s.brand,
        s.category,
        SUM(ftx.amount) AS revenue,
        SUM(ftx.units)  AS units
    FROM ftx
    JOIN skus s USING(sku_id)
    GROUP BY s.sku_id, s.product_name, s.brand, s.category
    ORDER BY revenue DESC
    LIMIT $lim;
    """
    return fetch_df(sql, params)


def weekday_weekend_split(filters: FilterParams) -> tuple[float, float]:
    cte, params = _build_filtered_transactions_cte(filters)
    sql = f"""{cte}
    SELECT
        SUM(CASE WHEN EXTRACT(dow FROM date) IN (0, 6) THEN amount ELSE 0 END) AS weekend,
        SUM(amount) AS total
    FROM ftx;
    """
    row = fetch_df(sql, params).iloc[0]
    total = float(row["total"] or 0)
    weekend = float(row["weekend"] or 0)
    if total == 0:
        return (0.0, 0.0)
    return (weekend, (weekend / total) * 100)


def daily_revenue_series(days: int = 120) -> pd.DataFrame:
    sql = """
    SELECT date, SUM(amount) AS revenue
    FROM transactions
    GROUP BY date
    ORDER BY date DESC
    LIMIT $days;
    """
    df = fetch_df(sql, {"days": days})
    return df.sort_values("date").reset_index(drop=True)
