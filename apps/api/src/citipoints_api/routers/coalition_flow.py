"""Earn → Redeem coalition flow — Sankey data source.

Maps the points lifecycle across coalition partners. The LEFT side of the
Sankey is where Nexus are *earned* (top earning partners / stores). The
RIGHT side is where Nexus are *redeemed*. Each link is the AED-value of
points that flow from an earn partner to a redeem partner, modelled as
the product of the earn share × the redeem share per member journey.

Data source: `transactions` table. We treat `store` as the partner
identity (the demo warehouse has no separate partner dimension) and use
the existing `points_earned` / `points_redeemed` columns as the earn
and redeem signals. AED value = points × (1/200) redemption ratio.

If the warehouse later ships a real `partner_id` + `txn_type` column,
swap the two SELECT blocks — the response shape is stable.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from citipoints_api.data.store import FilterParams, fetch_df
from citipoints_api.schemas import (
    CoalitionFlowResponse,
    SankeyLink,
    SankeyNode,
)

router = APIRouter(prefix="/flow")

# Nexus public redemption ratio — 200 points = AED 1.
POINTS_TO_AED = 1.0 / 200.0

# Cap the bipartite graph so the Sankey stays readable.
TOP_EARN = 8
TOP_REDEEM = 8


def _partner_totals(
    filters: FilterParams,
) -> tuple[list[tuple[str, float]], list[tuple[str, float]]]:
    """Return (earn_partners, redeem_partners) each as list of (name, aed)."""
    where, params = filters.where_clause()
    # Replace `c.tier` refs when tier filter unused — the CTE joins customers
    # only when needed; to keep query simple we always join.
    sql = f"""
    SELECT
        t.store AS partner,
        SUM(t.points_earned)   AS points_earned,
        SUM(t.points_redeemed) AS points_redeemed
    FROM transactions t
    JOIN customers c USING(customer_id)
    WHERE 1=1 {where}
    GROUP BY t.store
    ORDER BY (SUM(t.points_earned) + SUM(t.points_redeemed)) DESC
    """
    df = fetch_df(sql, params)
    if df.empty:
        return [], []

    earn_rows = df[["partner", "points_earned"]].copy()
    earn_rows = earn_rows.sort_values("points_earned", ascending=False).head(TOP_EARN)
    redeem_rows = df[["partner", "points_redeemed"]].copy()
    redeem_rows = redeem_rows.sort_values("points_redeemed", ascending=False).head(TOP_REDEEM)

    earn = [
        (str(row.partner), float(row.points_earned) * POINTS_TO_AED)
        for row in earn_rows.itertuples(index=False)
        if float(row.points_earned) > 0
    ]
    redeem = [
        (str(row.partner), float(row.points_redeemed) * POINTS_TO_AED)
        for row in redeem_rows.itertuples(index=False)
        if float(row.points_redeemed) > 0
    ]
    return earn, redeem


def _member_journey_links(
    filters: FilterParams,
    earn_partners: list[str],
    redeem_partners: list[str],
) -> list[tuple[str, str, float]]:
    """Build a matrix of (earn_partner, redeem_partner, aed) links using
    the member-journey approximation: for every member we compute their
    share of earn at each partner and their share of redeem at each
    partner, then allocate their total redeemed AED proportionally.

    This is cheaper than Markov chaining the full ledger and gives a
    visually rich Sankey without hitting BigQuery row limits.
    """
    if not earn_partners or not redeem_partners:
        return []

    where, params = filters.where_clause()
    sql = f"""
    SELECT
        t.customer_id,
        t.store AS partner,
        SUM(t.points_earned)   AS points_earned,
        SUM(t.points_redeemed) AS points_redeemed
    FROM transactions t
    JOIN customers c USING(customer_id)
    WHERE 1=1 {where}
    GROUP BY t.customer_id, t.store
    """
    df = fetch_df(sql, params)
    if df.empty:
        return []

    earn_set = set(earn_partners)
    redeem_set = set(redeem_partners)
    df = df[df["partner"].isin(earn_set | redeem_set)]
    if df.empty:
        return []

    # Per-member totals
    totals = df.groupby("customer_id")[["points_earned", "points_redeemed"]].sum().reset_index()
    totals = totals.rename(columns={"points_earned": "mem_earn", "points_redeemed": "mem_redeem"})
    df = df.merge(totals, on="customer_id")

    earn_df = df[df["partner"].isin(earn_set)].copy()
    earn_df["earn_share"] = earn_df["points_earned"] / earn_df["mem_earn"].where(
        earn_df["mem_earn"] > 0, 1
    )

    redeem_df = df[df["partner"].isin(redeem_set)].copy()
    redeem_df["redeem_share"] = redeem_df["points_redeemed"] / redeem_df["mem_redeem"].where(
        redeem_df["mem_redeem"] > 0, 1
    )

    # Prep disjoint column names before the merge so pandas suffixes don't
    # collide with the shared `points_redeemed` column.
    earn_small = earn_df[["customer_id", "partner", "earn_share"]].rename(
        columns={"partner": "earn_partner"}
    )
    redeem_small = redeem_df[["customer_id", "partner", "points_redeemed"]].rename(
        columns={"partner": "redeem_partner", "points_redeemed": "redeem_points"}
    )
    merged = earn_small.merge(redeem_small, on="customer_id")
    merged["alloc_points"] = merged["earn_share"] * merged["redeem_points"]
    links = merged.groupby(["earn_partner", "redeem_partner"])["alloc_points"].sum().reset_index()
    links["aed"] = links["alloc_points"] * POINTS_TO_AED
    links = links[links["aed"] > 0].sort_values("aed", ascending=False)

    return [
        (str(row.earn_partner), str(row.redeem_partner), float(row.aed))
        for row in links.itertuples(index=False)
    ]


@router.get("/category", response_model=CoalitionFlowResponse)
def coalition_flow(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> CoalitionFlowResponse:
    filters = FilterParams(date_from=date_from, date_to=date_to)
    earn, redeem = _partner_totals(filters)

    if not earn or not redeem:
        return CoalitionFlowResponse(
            nodes=[],
            links=[],
            total_aed=0.0,
            earn_partner_count=0,
            redeem_partner_count=0,
        )

    earn_names = [name for name, _ in earn]
    redeem_names = [name for name, _ in redeem]
    raw_links = _member_journey_links(filters, earn_names, redeem_names)

    # Earn-side node ids get an "earn::" prefix to keep them distinct from
    # same-name redeem nodes (a partner can appear on both sides).
    def earn_id(name: str) -> str:
        return f"earn::{name}"

    def redeem_id(name: str) -> str:
        return f"redeem::{name}"

    nodes: list[SankeyNode] = []
    for name, _aed in earn:
        nodes.append(SankeyNode(id=earn_id(name), name=name, side="earn"))
    for name, _aed in redeem:
        nodes.append(SankeyNode(id=redeem_id(name), name=name, side="redeem"))

    links = [
        SankeyLink(
            source=earn_id(src),
            target=redeem_id(tgt),
            value_aed=round(aed, 2),
        )
        for src, tgt, aed in raw_links
    ]

    total_aed = sum(link.value_aed for link in links)

    return CoalitionFlowResponse(
        nodes=nodes,
        links=links,
        total_aed=round(total_aed, 2),
        earn_partner_count=len(earn),
        redeem_partner_count=len(redeem),
    )
