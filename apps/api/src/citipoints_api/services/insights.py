"""Auto-insight generators — turn raw data into plain-English callouts."""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from citipoints_api.data.store import FilterParams
from citipoints_api.schemas import Insight
from citipoints_api.services import queries


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


def home_insights(filters: FilterParams) -> tuple[str, list[Insight]]:
    """Generate insights for the Home/Overview page."""
    question = "How is loyalty performing right now — and where should we act this week?"
    current = queries.kpi_snapshot(filters)
    prev = queries.kpi_prev_snapshot(filters)
    weekend_revenue, weekend_pct = queries.weekday_weekend_split(filters)
    stores = queries.store_performance(filters)
    tiers = queries.tier_distribution(filters)

    out: list[Insight] = []

    if current["revenue"] and prev["revenue"]:
        delta = ((current["revenue"] - prev["revenue"]) / prev["revenue"]) * 100
        if delta < -3:
            out.append(
                Insight(
                    id="revenue-decline",
                    title=f"Revenue down {abs(delta):.1f}% period-over-period",
                    text=(
                        f"Revenue fell to AED {current['revenue']:,.0f} "
                        f"(prev AED {prev['revenue']:,.0f}). Investigate store and category mix."
                    ),
                    priority="critical",
                    icon="alert-triangle",
                    action="Open Store Performance + Category Mix to find the weakest segment.",
                    evidence_chart_id="store-performance",
                ),
            )
        elif delta > 5:
            out.append(
                Insight(
                    id="revenue-growth",
                    title=f"Revenue up {delta:.1f}% period-over-period",
                    text=(
                        f"Revenue grew to AED {current['revenue']:,.0f} — "
                        "protect the winning stores and double-down on the leading category."
                    ),
                    priority="opportunity",
                    icon="trending-up",
                    action="Export top-performing stores → brief ops to replicate their playbook.",
                    evidence_chart_id="revenue-trend",
                ),
            )

    if current["points_earned"] and current["redemption_rate"] < 20:
        out.append(
            Insight(
                id="low-redemption",
                title="Redemption rate below 20% — high breakage risk",
                text=(
                    f"Only {current['redemption_rate']:.1f}% of issued points were redeemed "
                    "this window. Points sitting on the balance sheet = deferred liability "
                    "plus disengaged members."
                ),
                priority="warning",
                icon="coins",
                action="Trigger a double-points expiry reminder to Silver+Bronze members.",
                evidence_chart_id="kpi-redemption-rate",
            ),
        )

    if weekend_pct > 38:
        out.append(
            Insight(
                id="weekend-skew",
                title=f"Weekend drives {weekend_pct:.1f}% of revenue",
                text=(
                    f"Weekend revenue is AED {weekend_revenue:,.0f}. Consider weekend-only "
                    "loyalty multipliers for Silver tier to push them to Gold velocity."
                ),
                priority="opportunity",
                icon="calendar",
                action="Draft 2x points weekend campaign — scope via Segment Persona page.",
                evidence_chart_id="revenue-trend",
            ),
        )

    if not stores.empty:
        top = stores.iloc[0]
        bottom = stores.iloc[-1]
        if top["revenue"] > 0 and bottom["revenue"] > 0:
            ratio = top["revenue"] / bottom["revenue"]
            if ratio > 2.5:
                out.append(
                    Insight(
                        id="store-spread",
                        title=f"{top['store']} out-earning {bottom['store']} by {ratio:.1f}x",
                        text=(
                            "Top store generates AED "
                            f"{top['revenue']:,.0f} vs AED {bottom['revenue']:,.0f} at the "
                            "tail. Investigate staffing, assortment, and catchment."
                        ),
                        priority="warning",
                        icon="store",
                        action="Open Store Clustering to find sister stores to benchmark against.",
                        evidence_chart_id="store-performance",
                    ),
                )

    if not tiers.empty:
        platinum = tiers[tiers["tier"] == "Platinum"]
        if not platinum.empty:
            share = float(platinum["share_pct"].iloc[0])
            out.append(
                Insight(
                    id="platinum-concentration",
                    title=f"Platinum tier generates {share:.1f}% of revenue",
                    text=(
                        "A small set of Platinum members drives an outsized share. "
                        "Revenue concentration risk — retention of this segment is mission-critical."
                    ),
                    priority="info",
                    icon="crown",
                    action="Ship a private Platinum concierge pilot — target N=50.",
                    evidence_chart_id="tier-distribution",
                ),
            )

    return question, out


def basket_insights(rules: pd.DataFrame) -> list[Insight]:
    """Insights for the Market Basket page."""
    out: list[Insight] = []
    if rules.empty:
        return out

    top = rules.iloc[0]
    out.append(
        Insight(
            id="strongest-pair",
            title="Highest-lift bundle opportunity",
            text=(
                f"Customers who buy {top['antecedents_label']} are "
                f"{top['lift']:.2f}x more likely to also buy {top['consequents_label']}. "
                f"Confidence: {top['confidence']:.0%}."
            ),
            priority="opportunity",
            icon="sparkles",
            action=(
                f"Launch '{top['antecedents_label']} + {top['consequents_label']}' "
                "bundle at 10% off for 14 days."
            ),
            evidence_chart_id="basket-top-pairs",
        ),
    )

    high_lift = rules[rules["lift"] > 3.0]
    if len(high_lift) >= 5:
        out.append(
            Insight(
                id="many-strong-pairs",
                title=f"{len(high_lift)} pairs with lift > 3.0",
                text=(
                    "A rich pool of cross-sell opportunities. "
                    "Priority: the pairs where both items are in the same store aisle (ops-simple)."
                ),
                priority="info",
                icon="layers",
                evidence_chart_id="basket-network",
            ),
        )

    return out


def segment_insights(rfm: pd.DataFrame) -> list[Insight]:
    out: list[Insight] = []
    if rfm.empty:
        return out

    counts = rfm["segment"].value_counts()
    total = len(rfm)

    at_risk = int(counts.get("At Risk", 0))
    if at_risk:
        at_risk_rev = rfm.loc[rfm["segment"] == "At Risk", "monetary"].sum()
        out.append(
            Insight(
                id="at-risk",
                title=f"{at_risk} At-Risk members worth AED {at_risk_rev:,.0f}",
                text=(
                    f"{at_risk / total * 100:.1f}% of the base used to buy frequently and have "
                    "stopped. Intervention now is cheaper than reacquisition later."
                ),
                priority="critical",
                icon="life-buoy",
                action="Send win-back campaign w/ 2x points + tiered voucher (AED 25 / 50 / 100).",
                evidence_chart_id="segments-persona-grid",
            ),
        )

    champions = int(counts.get("Champions", 0))
    if champions:
        champ_rev = rfm.loc[rfm["segment"] == "Champions", "monetary"].sum()
        total_rev = rfm["monetary"].sum()
        share = (champ_rev / total_rev * 100) if total_rev else 0
        out.append(
            Insight(
                id="champions-value",
                title=f"Champions drive {share:.1f}% of revenue",
                text=(
                    f"{champions} members ({champions / total * 100:.1f}% of base) "
                    f"generate AED {champ_rev:,.0f}. Protect with exclusive perks and early access."
                ),
                priority="info",
                icon="award",
                evidence_chart_id="segments-persona-grid",
            ),
        )
    return out


def churn_insights(high_risk_count: int, high_risk_revenue: float, auc: float) -> list[Insight]:
    return [
        Insight(
            id="churn-act-now",
            title=f"{high_risk_count} high-risk customers — model AUC {auc:.2f}",
            text=(
                f"Combined historical spend of AED {high_risk_revenue:,.0f} at risk. "
                "The Act Now list ranks them by urgency × CLV."
            ),
            priority="critical",
            icon="target",
            action="Export Act Now list → push to campaign tool → run win-back sequence.",
            evidence_chart_id="churn-act-now-list",
        ),
    ]


def now_iso() -> str:
    return _now_iso()
