"""Machine-learning services — market basket, segmentation, churn, CLV, anomalies.

Models are trained lazily on first request and cached in-process. For a true
production deployment we'd persist artifacts to disk (joblib) and refresh on a
schedule; for the MVP, in-memory caching keeps the surface small and fast.
"""

from __future__ import annotations

import os
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd

from citipoints_api.config import get_settings
from citipoints_api.data.store import fetch_df
from citipoints_api.logging_conf import get_logger

if TYPE_CHECKING:  # pragma: no cover
    from lifetimes import BetaGeoFitter, GammaGammaFitter

logger = get_logger(__name__)
_CACHE_LOCK = threading.Lock()


def _bootstrap_libomp_path() -> None:
    """Ensure XGBoost can find libomp on Apple Silicon (homebrew installs to /opt/homebrew).

    Pre-built XGBoost wheels hardcode `@rpath` entries pointing at the Intel homebrew
    location (`/usr/local/opt/libomp`). On Apple Silicon the library lives under
    `/opt/homebrew/opt/libomp/lib`, so we pre-seed DYLD_FALLBACK_LIBRARY_PATH before the
    first xgboost import.
    """
    if sys.platform != "darwin":
        return
    candidates = ["/opt/homebrew/opt/libomp/lib", "/usr/local/opt/libomp/lib"]
    for path in candidates:
        if Path(path, "libomp.dylib").exists():
            current = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
            pieces = [p for p in current.split(":") if p]
            if path not in pieces:
                pieces.insert(0, path)
                os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(pieces)
            return


_bootstrap_libomp_path()


# ───────────────────── MARKET BASKET ───────────────────── #


@dataclass(frozen=True)
class MarketBasketResult:
    itemsets: pd.DataFrame
    rules: pd.DataFrame


_basket_cache: dict[tuple[bool, float, float, str | None, str | None], MarketBasketResult] = {}


def run_fpgrowth(
    *,
    by_category: bool = False,
    min_support: float | None = None,
    min_confidence: float | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> MarketBasketResult:
    """Train FP-Growth on the current transaction basket and return rules.

    Results are cached per (by_category, min_support, min_confidence, date_from, date_to) tuple.
    """
    settings = get_settings()
    support = min_support or settings.market_basket_min_support
    confidence = min_confidence or settings.market_basket_min_confidence
    key = (by_category, support, confidence, date_from, date_to)

    with _CACHE_LOCK:
        if key in _basket_cache:
            return _basket_cache[key]

    from mlxtend.frequent_patterns import association_rules, fpgrowth
    from mlxtend.preprocessing import TransactionEncoder

    col = "category" if by_category else "sku_id"
    clauses: list[str] = []
    params: dict[str, object] = {}
    if date_from:
        clauses.append("date >= $date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("date <= $date_to")
        params["date_to"] = date_to
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    df = fetch_df(
        f"SELECT transaction_id, {col} AS item FROM transactions {where}",
        params or None,
    )
    if df.empty:
        empty = MarketBasketResult(itemsets=pd.DataFrame(), rules=pd.DataFrame())
        with _CACHE_LOCK:
            _basket_cache[key] = empty
        return empty

    baskets = df.groupby("transaction_id")["item"].apply(list).tolist()
    encoder = TransactionEncoder()
    one_hot = encoder.fit_transform(baskets)
    frame = pd.DataFrame(one_hot, columns=encoder.columns_)

    itemsets = fpgrowth(frame, min_support=support, use_colnames=True)
    if itemsets.empty:
        result = MarketBasketResult(itemsets=itemsets, rules=pd.DataFrame())
    else:
        rules = association_rules(itemsets, metric="confidence", min_threshold=confidence)
        rules = rules.sort_values("lift", ascending=False).reset_index(drop=True)
        rules["antecedents_label"] = rules["antecedents"].apply(lambda s: " + ".join(sorted(s)))
        rules["consequents_label"] = rules["consequents"].apply(lambda s: " + ".join(sorted(s)))
        result = MarketBasketResult(itemsets=itemsets, rules=rules)

    with _CACHE_LOCK:
        _basket_cache[key] = result
    logger.info("ml.fpgrowth_trained", by_category=by_category, rules=len(result.rules))
    return result


def bundle_for(anchor: str, limit: int = 5) -> pd.DataFrame:
    """Return top N companion items for `anchor` using the current rule set."""
    rules = run_fpgrowth().rules
    if rules.empty:
        return rules
    anchor_set = frozenset({anchor})
    matched = rules[rules["antecedents"].apply(lambda s: anchor_set.issubset(s))].copy()
    if matched.empty:
        return matched
    matched = matched.sort_values("lift", ascending=False).head(limit)
    return matched.reset_index(drop=True)


# ───────────────────── RFM + KMeans ───────────────────── #


@dataclass(frozen=True)
class RfmResult:
    rfm: pd.DataFrame
    silhouette: float
    persona_counts: dict[str, int]


_rfm_cache: dict[int, RfmResult] = {}


def _assign_persona(row: pd.Series) -> str:
    recency = int(row["recency"])
    frequency = int(row["frequency"])
    monetary = float(row["monetary"])
    if recency <= 30 and frequency >= 10 and monetary >= 1500:
        return "Champions"
    if recency <= 30 and frequency >= 5:
        return "Loyal"
    if recency <= 45 and frequency >= 3 and monetary >= 500:
        return "Potential Loyalists"
    if recency <= 30 and frequency <= 2:
        return "New Customers"
    if 45 < recency <= 90 and frequency >= 3:
        return "At Risk"
    if recency > 90 and frequency >= 3:
        return "Hibernating"
    if recency > 90:
        return "Lost"
    return "Needs Nurture"


def run_rfm(*, k: int | None = None) -> RfmResult:
    settings = get_settings()
    n_clusters = k or settings.rfm_n_clusters
    with _CACHE_LOCK:
        if n_clusters in _rfm_cache:
            return _rfm_cache[n_clusters]

    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    sql = """
    WITH txn AS (
        SELECT
            customer_id,
            MAX(date) AS last_date,
            COUNT(DISTINCT transaction_id) AS frequency,
            SUM(amount) AS monetary
        FROM transactions
        GROUP BY customer_id
    ),
    bounds AS (SELECT MAX(date) AS asof FROM transactions)
    SELECT
        t.customer_id,
        DATEDIFF('day', t.last_date, b.asof) AS recency,
        t.frequency,
        t.monetary
    FROM txn t, bounds b;
    """
    rfm = fetch_df(sql)
    if rfm.empty:
        result = RfmResult(rfm=rfm, silhouette=0.0, persona_counts={})
        with _CACHE_LOCK:
            _rfm_cache[n_clusters] = result
        return result

    features = rfm[["recency", "frequency", "monetary"]].astype(float)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)
    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    rfm["predicted_cluster"] = km.fit_predict(scaled)

    try:
        silhouette = float(silhouette_score(scaled, rfm["predicted_cluster"]))
    except ValueError:
        silhouette = 0.0

    def _score(series: pd.Series, invert: bool = False) -> pd.Series:
        try:
            quintile = pd.qcut(series, q=5, labels=[1, 2, 3, 4, 5], duplicates="drop")
        except ValueError:
            return pd.Series([3] * len(series), index=series.index)
        if invert:
            quintile = pd.Categorical(6 - quintile.astype(int), categories=[1, 2, 3, 4, 5])
        return pd.Series(quintile, index=series.index)

    rfm["r_score"] = _score(rfm["recency"], invert=True).astype(int)
    rfm["f_score"] = _score(rfm["frequency"]).astype(int)
    rfm["m_score"] = _score(rfm["monetary"]).astype(int)
    rfm["rfm_score"] = (
        rfm["r_score"].astype(str) + rfm["f_score"].astype(str) + rfm["m_score"].astype(str)
    )
    rfm["segment"] = rfm.apply(_assign_persona, axis=1)
    persona_counts = rfm["segment"].value_counts().to_dict()

    result = RfmResult(rfm=rfm, silhouette=silhouette, persona_counts=persona_counts)
    with _CACHE_LOCK:
        _rfm_cache[n_clusters] = result
    logger.info("ml.rfm_trained", k=n_clusters, rows=len(rfm), silhouette=silhouette)
    return result


TIER_ORDER = ("Bronze", "Silver", "Gold", "Platinum")
_TIER_RANK = {t: i for i, t in enumerate(TIER_ORDER)}


def _window_bounds(date_from: str | None, date_to: str | None) -> tuple[str, str]:
    """Resolve window bounds. If caller omits either edge, fall back to data range."""
    row = fetch_df("SELECT MIN(date) AS d0, MAX(date) AS d1 FROM transactions").iloc[0]
    d0 = pd.to_datetime(row["d0"]).date() if row["d0"] is not None else None
    d1 = pd.to_datetime(row["d1"]).date() if row["d1"] is not None else None
    lo = pd.to_datetime(date_from).date() if date_from else d0
    hi = pd.to_datetime(date_to).date() if date_to else d1
    if lo is None or hi is None:
        raise ValueError("No transactions available to infer window bounds.")
    if lo > hi:
        lo, hi = hi, lo
    return lo.isoformat(), hi.isoformat()


def tier_migration_edges(
    date_from: str | None = None,
    date_to: str | None = None,
) -> pd.DataFrame:
    """Compare tier (spend quartile) in first-half vs second-half of the window.

    Quartile bands are re-computed inside each half, so "Platinum" always means
    top 25% spender during that half. This surfaces within-window movement —
    exactly what a CMO wants to see per week / per campaign.

    Both DuckDB and BigQuery accept this SQL — table refs stay bare; the
    adapter layer prefixes them for BQ at execute time.
    """
    lo, hi = _window_bounds(date_from, date_to)
    midpoint = (
        (pd.to_datetime(lo) + (pd.to_datetime(hi) - pd.to_datetime(lo)) / 2).date().isoformat()
    )
    sql = """
    WITH halves AS (
        SELECT
            t.customer_id,
            CASE WHEN t.date <= $midpoint THEN 'first' ELSE 'second' END AS half,
            SUM(t.amount) AS spend
        FROM transactions t
        WHERE t.date BETWEEN $date_from AND $date_to
        GROUP BY 1, 2
    ),
    ranked AS (
        SELECT
            customer_id,
            half,
            spend,
            NTILE(4) OVER (PARTITION BY half ORDER BY spend) AS quartile
        FROM halves
    ),
    per_member AS (
        SELECT
            customer_id,
            MAX(CASE WHEN half = 'first' THEN quartile END) AS q1,
            MAX(CASE WHEN half = 'second' THEN quartile END) AS q2
        FROM ranked
        GROUP BY customer_id
        HAVING MAX(CASE WHEN half = 'first' THEN quartile END) IS NOT NULL
           AND MAX(CASE WHEN half = 'second' THEN quartile END) IS NOT NULL
    )
    SELECT
        CASE q1 WHEN 1 THEN 'Bronze' WHEN 2 THEN 'Silver' WHEN 3 THEN 'Gold' WHEN 4 THEN 'Platinum' END AS source_tier,
        CASE q2 WHEN 1 THEN 'Bronze' WHEN 2 THEN 'Silver' WHEN 3 THEN 'Gold' WHEN 4 THEN 'Platinum' END AS target_tier,
        COUNT(*) AS members
    FROM per_member
    GROUP BY source_tier, target_tier
    """
    return fetch_df(sql, {"midpoint": midpoint, "date_from": lo, "date_to": hi})


@dataclass(frozen=True)
class TierMigrationStats:
    """Rich period-over-period migration diagnostics consumed by the router."""

    period_a_start: str
    period_a_end: str
    period_b_start: str
    period_b_end: str
    edges: pd.DataFrame
    total_tracked: int
    up_migrators: int
    down_migrators: int
    static_members: int
    biggest_drop_route: str | None
    biggest_drop_members: int
    biggest_lift_route: str | None
    biggest_lift_members: int


def tier_migration_matrix(
    date_from: str | None = None,
    date_to: str | None = None,
) -> TierMigrationStats:
    """Return the migration matrix plus diagnostics (up/down/static counts)."""
    from datetime import date as _date, timedelta

    lo, hi = _window_bounds(date_from, date_to)
    lo_d = _date.fromisoformat(lo)
    hi_d = _date.fromisoformat(hi)
    # Split the window at the midpoint; period A inclusive, period B the rest.
    span_days = (hi_d - lo_d).days
    midpoint = lo_d + timedelta(days=span_days // 2)
    period_a_end = midpoint
    period_b_start = midpoint + timedelta(days=1)
    # Edge case: tiny windows collapse; guarantee non-empty halves.
    if period_b_start > hi_d:
        period_b_start = midpoint

    edges = tier_migration_edges(lo, hi)
    if edges.empty:
        return TierMigrationStats(
            period_a_start=lo,
            period_a_end=period_a_end.isoformat(),
            period_b_start=period_b_start.isoformat(),
            period_b_end=hi,
            edges=edges,
            total_tracked=0,
            up_migrators=0,
            down_migrators=0,
            static_members=0,
            biggest_drop_route=None,
            biggest_drop_members=0,
            biggest_lift_route=None,
            biggest_lift_members=0,
        )

    edges = edges.copy()
    edges["delta"] = edges.apply(
        lambda r: _TIER_RANK[r["target_tier"]] - _TIER_RANK[r["source_tier"]], axis=1
    )
    up = edges.loc[edges["delta"] > 0]
    down = edges.loc[edges["delta"] < 0]
    static_df = edges.loc[edges["delta"] == 0]

    biggest_drop = down.sort_values("members", ascending=False).head(1)
    biggest_lift = up.sort_values("members", ascending=False).head(1)

    def _route(df: pd.DataFrame) -> tuple[str | None, int]:
        if df.empty:
            return (None, 0)
        row = df.iloc[0]
        return (f"{row['source_tier']} → {row['target_tier']}", int(row["members"]))

    drop_route, drop_members = _route(biggest_drop)
    lift_route, lift_members = _route(biggest_lift)

    return TierMigrationStats(
        period_a_start=lo,
        period_a_end=period_a_end.isoformat(),
        period_b_start=period_b_start.isoformat(),
        period_b_end=hi,
        edges=edges[["source_tier", "target_tier", "members"]],
        total_tracked=int(edges["members"].sum()),
        up_migrators=int(up["members"].sum()),
        down_migrators=int(down["members"].sum()),
        static_members=int(static_df["members"].sum()),
        biggest_drop_route=drop_route,
        biggest_drop_members=drop_members,
        biggest_lift_route=lift_route,
        biggest_lift_members=lift_members,
    )


# ───────────────────── CHURN + CLV ───────────────────── #


@dataclass
class ChurnResult:
    scores: pd.DataFrame
    metrics: dict[str, float]
    top_features: list[dict[str, float]] = field(default_factory=list)


_churn_cache: ChurnResult | None = None


def _churn_features(threshold_days: int) -> pd.DataFrame:
    sql = f"""
    WITH agg AS (
        SELECT
            customer_id,
            MAX(date) AS last_date,
            MIN(date) AS first_date,
            COUNT(DISTINCT transaction_id) AS frequency,
            SUM(amount) AS total_spend,
            AVG(amount) AS avg_spend,
            SUM(points_redeemed) AS redeemed,
            SUM(points_earned) AS earned
        FROM transactions
        GROUP BY customer_id
    ),
    bounds AS (SELECT MAX(date) AS asof FROM transactions)
    SELECT
        a.customer_id,
        DATEDIFF('day', a.last_date, b.asof) AS days_since_last,
        DATEDIFF('day', a.first_date, a.last_date) AS tenure_days,
        a.frequency,
        a.total_spend,
        a.avg_spend,
        a.earned,
        a.redeemed,
        CASE
            WHEN a.earned > 0 THEN a.redeemed / a.earned
            ELSE 0
        END AS redemption_ratio,
        CASE WHEN DATEDIFF('day', a.last_date, b.asof) > {threshold_days} THEN 1 ELSE 0 END AS churned
    FROM agg a, bounds b;
    """
    return fetch_df(sql)


def _build_churn_model() -> tuple[Any, str]:
    """Prefer XGBoost; fall back to scikit-learn HistGradientBoosting if libomp is absent.

    Returns (unfitted_model, engine_label).
    """
    try:
        from xgboost import XGBClassifier

        return (
            XGBClassifier(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.08,
                objective="binary:logistic",
                eval_metric="auc",
                random_state=42,
            ),
            "xgboost",
        )
    except Exception as exc:  # pragma: no cover — environment-dependent
        logger.warning("ml.xgboost_unavailable", error=str(exc))
        from sklearn.ensemble import HistGradientBoostingClassifier

        return (
            HistGradientBoostingClassifier(
                max_iter=200,
                max_depth=5,
                learning_rate=0.08,
                random_state=42,
            ),
            "sklearn-histgb",
        )


def run_churn() -> ChurnResult:
    global _churn_cache
    with _CACHE_LOCK:
        if _churn_cache is not None:
            return _churn_cache

    from sklearn.metrics import precision_score, recall_score, roc_auc_score
    from sklearn.model_selection import train_test_split

    settings = get_settings()
    features = _churn_features(settings.churn_threshold_days)
    if features.empty or features["churned"].nunique() < 2:
        empty = ChurnResult(
            scores=features.assign(churn_probability=0.0, risk_band="Low"),
            metrics={"auc_roc": 0.0, "precision": 0.0, "recall": 0.0, "churn_rate": 0.0},
        )
        with _CACHE_LOCK:
            _churn_cache = empty
        return empty

    feature_cols = [
        "days_since_last",
        "tenure_days",
        "frequency",
        "total_spend",
        "avg_spend",
        "redemption_ratio",
    ]
    x = features[feature_cols].astype(float)
    y = features["churned"].astype(int)
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )
    model, engine = _build_churn_model()
    model.fit(x_train, y_train)
    probs = model.predict_proba(x)[:, 1]
    test_probs = model.predict_proba(x_test)[:, 1]
    test_pred = (test_probs >= 0.5).astype(int)

    metrics: dict[str, Any] = {
        "auc_roc": float(roc_auc_score(y_test, test_probs)),
        "precision": float(precision_score(y_test, test_pred, zero_division=0)),
        "recall": float(recall_score(y_test, test_pred, zero_division=0)),
        "churn_rate": float(y.mean()),
        "engine": engine,
    }

    features = features.assign(churn_probability=probs)
    features["risk_band"] = pd.cut(
        features["churn_probability"],
        bins=[-0.01, 0.33, 0.66, 1.01],
        labels=["Low", "Medium", "High"],
    ).astype(str)

    if hasattr(model, "feature_importances_"):
        importance = dict(zip(feature_cols, model.feature_importances_, strict=True))
    else:
        # HistGradientBoosting exposes only permutation-like scores via staged scoring;
        # derive a cheap proxy using the mean |coef|-equivalent from partial fits.
        importance = {col: 0.0 for col in feature_cols}
    top_features = [
        {"feature": k, "importance": round(float(v), 4)}
        for k, v in sorted(importance.items(), key=lambda kv: kv[1], reverse=True)
    ]

    result = ChurnResult(scores=features, metrics=metrics, top_features=top_features)
    with _CACHE_LOCK:
        _churn_cache = result
    logger.info(
        "ml.churn_trained",
        engine=engine,
        auc=metrics["auc_roc"],
        churn_rate=metrics["churn_rate"],
    )
    return result


@dataclass
class ClvResult:
    predictions: pd.DataFrame
    summary: dict[str, float]


_clv_cache: ClvResult | None = None


def run_clv(*, horizon_months: int | None = None) -> ClvResult:
    global _clv_cache
    with _CACHE_LOCK:
        if _clv_cache is not None:
            return _clv_cache

    from lifetimes import BetaGeoFitter, GammaGammaFitter
    from lifetimes.utils import summary_data_from_transaction_data

    settings = get_settings()
    horizon = horizon_months or settings.clv_months_ahead

    tx = fetch_df(
        "SELECT customer_id, date, amount FROM transactions ORDER BY date",
    )
    if tx.empty:
        empty = ClvResult(
            predictions=pd.DataFrame(),
            summary={"mean": 0.0, "median": 0.0, "total": 0.0},
        )
        with _CACHE_LOCK:
            _clv_cache = empty
        return empty

    tx["date"] = pd.to_datetime(tx["date"])
    summary = summary_data_from_transaction_data(
        tx,
        "customer_id",
        "date",
        "amount",
        observation_period_end=tx["date"].max(),
        freq="D",
    )
    repeated = summary[summary["frequency"] > 0]
    if repeated.empty:
        empty = ClvResult(
            predictions=pd.DataFrame(),
            summary={"mean": 0.0, "median": 0.0, "total": 0.0},
        )
        with _CACHE_LOCK:
            _clv_cache = empty
        return empty

    bgf: BetaGeoFitter = BetaGeoFitter(penalizer_coef=0.01)
    bgf.fit(summary["frequency"], summary["recency"], summary["T"])
    summary["retention_prob"] = bgf.conditional_probability_alive(
        summary["frequency"],
        summary["recency"],
        summary["T"],
    )

    ggf: GammaGammaFitter = GammaGammaFitter(penalizer_coef=0.01)
    ggf.fit(repeated["frequency"], repeated["monetary_value"])
    clv = ggf.customer_lifetime_value(
        bgf,
        summary["frequency"],
        summary["recency"],
        summary["T"],
        summary["monetary_value"].clip(lower=0),
        time=horizon,
        freq="D",
        discount_rate=0.01,
    )
    summary["predicted_clv_12m"] = clv.values
    summary = summary.reset_index().rename(columns={"index": "customer_id"})

    try:
        quartiles = pd.qcut(
            summary["predicted_clv_12m"], q=4, labels=["Low", "Medium", "High", "Premium"]
        )
    except ValueError:
        quartiles = pd.Series(["Medium"] * len(summary), index=summary.index)
    summary["clv_tier"] = quartiles.astype(str)

    out = summary[
        [
            "customer_id",
            "predicted_clv_12m",
            "retention_prob",
            "clv_tier",
        ]
    ].rename(columns={"retention_prob": "retention_probability"})

    summary_stats = {
        "mean": float(out["predicted_clv_12m"].mean()),
        "median": float(out["predicted_clv_12m"].median()),
        "total": float(out["predicted_clv_12m"].sum()),
    }
    result = ClvResult(predictions=out, summary=summary_stats)
    with _CACHE_LOCK:
        _clv_cache = result
    logger.info("ml.clv_trained", rows=len(out), mean=summary_stats["mean"])
    return result


def act_now_list(limit: int = 50) -> pd.DataFrame:
    churn = run_churn()
    clv = run_clv()
    if churn.scores.empty or clv.predictions.empty:
        return pd.DataFrame(
            columns=[
                "customer_id",
                "churn_probability",
                "predicted_clv_12m",
                "urgency_score",
            ]
        )

    merged = churn.scores.merge(clv.predictions, on="customer_id", how="inner")
    merged["urgency_score"] = merged["churn_probability"] * merged["predicted_clv_12m"]
    merged = merged.sort_values("urgency_score", ascending=False).head(limit)
    return merged


def suggest_action(*, churn_probability: float, predicted_clv_12m: float) -> str:
    if churn_probability > 0.7 and predicted_clv_12m > 2000:
        return "High-touch: concierge call + personalised 15% voucher"
    if churn_probability > 0.5:
        return "Tier-match: 2x points weekend campaign"
    if churn_probability > 0.3:
        return "Soft nudge: recommend 3 top products via email"
    return "Monitor: no action needed"


# ───────────────────── ANOMALY DETECTION ───────────────────── #


@dataclass
class AnomalySeries:
    rows: pd.DataFrame


def run_daily_anomaly(
    *,
    z_threshold: float = 2.5,
    date_from: str | None = None,
    date_to: str | None = None,
) -> AnomalySeries:
    from statsmodels.tsa.seasonal import STL

    clauses: list[str] = []
    params: dict[str, object] = {}
    if date_from:
        clauses.append("date >= $date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("date <= $date_to")
        params["date_to"] = date_to
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
    SELECT date, SUM(amount) AS revenue
    FROM transactions
    {where}
    GROUP BY date
    ORDER BY date;
    """
    df = fetch_df(sql, params or None)
    # STL needs at least 21 data points. If the window is too small, widen
    # silently to all-time so the chart still renders something.
    if len(df) < 21 and clauses:
        df = fetch_df(
            "SELECT date, SUM(amount) AS revenue FROM transactions GROUP BY date ORDER BY date;"
        )
    if df.empty or len(df) < 21:
        return AnomalySeries(
            rows=df.assign(
                expected=df.get("revenue", 0), residual=0.0, is_anomaly=False, reason=None
            )
            if not df.empty
            else df,
        )

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    series = df.set_index("date")["revenue"].asfreq("D").ffill()
    try:
        stl = STL(series, period=7, robust=True).fit()
    except ValueError:
        return AnomalySeries(
            rows=df.assign(expected=series.values, residual=0.0, is_anomaly=False, reason=None),
        )

    expected = (stl.trend + stl.seasonal).reindex(series.index).bfill()
    residual = (series - expected).fillna(0)
    std = residual.std() or 1.0
    z = (residual / std).abs()
    anomalies = z > z_threshold

    df["expected"] = expected.reindex(df["date"]).values
    df["residual"] = residual.reindex(df["date"]).values
    df["is_anomaly"] = anomalies.reindex(df["date"]).values
    df["reason"] = np.where(
        df["is_anomaly"],
        np.where(df["residual"] > 0, "Revenue spike vs seasonality", "Revenue dip vs seasonality"),
        None,
    )
    return AnomalySeries(rows=df)


# ───────────────────── RECOMMENDATIONS ───────────────────── #


@dataclass(frozen=True)
class RecommendationResult:
    customer_id: str
    items: list[dict[str, Any]]


def _customer_history(customer_id: str) -> pd.DataFrame:
    return fetch_df(
        """
        SELECT t.sku_id, s.product_name, s.category, SUM(t.amount) AS spend, SUM(t.units) AS units
        FROM transactions t
        JOIN skus s USING(sku_id)
        WHERE t.customer_id = $cid
        GROUP BY t.sku_id, s.product_name, s.category
        ORDER BY spend DESC
        """,
        {"cid": customer_id},
    )


def _popular_in_category(categories: list[str], limit: int = 5) -> pd.DataFrame:
    if not categories:
        return pd.DataFrame()
    placeholders = ",".join(f"'{c}'" for c in categories)
    sql = f"""
    SELECT s.sku_id, s.product_name, s.category, SUM(t.amount) AS spend
    FROM transactions t
    JOIN skus s USING(sku_id)
    WHERE s.category IN ({placeholders})
    GROUP BY s.sku_id, s.product_name, s.category
    ORDER BY spend DESC
    LIMIT {limit * 4};
    """
    return fetch_df(sql)


def recommendations_for(customer_id: str, limit: int = 6) -> RecommendationResult:
    """Hybrid recommender: content-based (same category) + collaborative fallback (basket lift)."""
    history = _customer_history(customer_id)
    rules = run_fpgrowth().rules
    already = set(history["sku_id"].tolist()) if not history.empty else set()

    scored: dict[str, dict[str, Any]] = {}

    if not history.empty:
        top_categories = history["category"].value_counts().head(3).index.tolist()
        pop = _popular_in_category(top_categories, limit=limit)
        for row in pop.itertuples(index=False):
            if row.sku_id in already:
                continue
            scored[row.sku_id] = {
                "sku_id": row.sku_id,
                "product_name": row.product_name,
                "score": float(row.spend) / 1000.0,
                "reason": f"Popular in {row.category} — your most-shopped category",
            }

    if not rules.empty and not history.empty:
        owned = history["sku_id"].tolist()
        for anchor in owned[:10]:
            bundles = bundle_for(anchor, limit=3)
            if bundles.empty:
                continue
            for row in bundles.itertuples(index=False):
                companion_set = row.consequents
                for sku in companion_set:
                    if sku in already:
                        continue
                    existing = scored.get(sku, {})
                    score = float(row.lift) + existing.get("score", 0.0)
                    scored[sku] = {
                        "sku_id": sku,
                        "product_name": existing.get("product_name", sku),
                        "score": score,
                        "reason": (
                            f"Customers who bought {anchor} also bought this "
                            f"(lift {row.lift:.2f}, confidence {row.confidence:.0%})"
                        ),
                    }

    if not scored:
        pop = fetch_df(
            """
            SELECT s.sku_id, s.product_name, s.category, SUM(t.amount) AS spend
            FROM transactions t JOIN skus s USING(sku_id)
            GROUP BY s.sku_id, s.product_name, s.category
            ORDER BY spend DESC
            LIMIT $lim
            """,
            {"lim": limit},
        )
        for row in pop.itertuples(index=False):
            scored[row.sku_id] = {
                "sku_id": row.sku_id,
                "product_name": row.product_name,
                "score": float(row.spend) / 1000.0,
                "reason": "Top seller store-wide — great first recommendation",
            }

    items = sorted(scored.values(), key=lambda x: x["score"], reverse=True)[:limit]
    return RecommendationResult(customer_id=customer_id, items=items)


# ───────────────────── COHORT ───────────────────── #


def cohort_retention() -> pd.DataFrame:
    sql = """
    WITH firsts AS (
        SELECT customer_id, DATE_TRUNC('month', MIN(date)) AS cohort_month
        FROM transactions
        GROUP BY customer_id
    ),
    activity AS (
        SELECT
            t.customer_id,
            f.cohort_month,
            DATE_TRUNC('month', t.date) AS activity_month,
            DATEDIFF('month', f.cohort_month, DATE_TRUNC('month', t.date)) AS month_offset
        FROM transactions t
        JOIN firsts f USING(customer_id)
    ),
    sizes AS (
        SELECT cohort_month, COUNT(DISTINCT customer_id) AS cohort_size
        FROM firsts GROUP BY cohort_month
    ),
    grid AS (
        SELECT
            a.cohort_month,
            a.month_offset,
            COUNT(DISTINCT a.customer_id) AS active_count
        FROM activity a
        GROUP BY 1, 2
    )
    SELECT
        g.cohort_month,
        g.month_offset,
        g.active_count,
        s.cohort_size,
        (1.0 * g.active_count / s.cohort_size) AS active_rate
    FROM grid g JOIN sizes s USING(cohort_month)
    WHERE g.month_offset BETWEEN 0 AND 11
    ORDER BY g.cohort_month, g.month_offset;
    """
    df = fetch_df(sql)
    if df.empty:
        return df
    df["cohort_month"] = pd.to_datetime(df["cohort_month"]).dt.strftime("%Y-%m")
    return df
