"""Next-Best-Action — rule + model hybrid per customer."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import NextBestAction
from citipoints_api.services import ml_models

router = APIRouter(prefix="/nba")


@router.get("/{customer_id}", response_model=NextBestAction)
def next_best_action(customer_id: str) -> NextBestAction:
    profile = fetch_df(
        """
        SELECT c.customer_id, c.name, c.tier,
               COUNT(DISTINCT t.transaction_id) AS frequency,
               SUM(t.amount) AS total_spend,
               MAX(t.date) AS last_date
        FROM customers c
        LEFT JOIN transactions t USING(customer_id)
        WHERE c.customer_id = $cid
        GROUP BY c.customer_id, c.name, c.tier
        """,
        {"cid": customer_id},
    )
    if profile.empty:
        raise HTTPException(status_code=404, detail="Customer not found")

    row = profile.iloc[0]
    tier = row["tier"]
    spend = float(row["total_spend"] or 0)
    frequency = int(row["frequency"] or 0)

    churn_scores = ml_models.run_churn().scores
    clv = ml_models.run_clv().predictions
    prob = 0.0
    clv_value = 0.0
    if not churn_scores.empty:
        match = churn_scores[churn_scores["customer_id"] == customer_id]
        if not match.empty:
            prob = float(match.iloc[0]["churn_probability"])
    if not clv.empty:
        match = clv[clv["customer_id"] == customer_id]
        if not match.empty:
            clv_value = float(match.iloc[0]["predicted_clv_12m"])

    if prob > 0.7 and tier in {"Platinum", "Gold"}:
        action = "Concierge outreach: personalised call + 15% tier-specific voucher"
        rationale = (
            f"Churn probability {prob:.0%} on a {tier} member with CLV AED {clv_value:,.0f}. "
            "Human-touch intervention has the best recovery rate for this segment."
        )
        expected_uplift = clv_value * 0.25
    elif prob > 0.5:
        action = "2x points weekend + reminder of expiring points"
        rationale = (
            f"Churn probability {prob:.0%}. Weekend multiplier is proven to lift "
            f"{tier} tier revisit rate and keeps reward perception alive."
        )
        expected_uplift = max(200.0, spend * 0.05)
    elif tier == "Bronze" and frequency >= 3:
        action = "Tier-up nudge: 'Reach Silver with 2 more visits this month'"
        rationale = (
            "Active Bronze member with clear intent. Explicit tier velocity messaging "
            "is the strongest upgrade driver per segment-migration data."
        )
        expected_uplift = 150.0
    else:
        action = "Curated product recommendations via email"
        rationale = (
            "Stable customer. Keep top-of-mind with 3 best-match products and a soft "
            "cross-sell to adjacent categories."
        )
        expected_uplift = 50.0

    return NextBestAction(
        customer_id=customer_id,
        action=action,
        rationale=rationale,
        expected_uplift_aed=round(expected_uplift, 2),
    )
