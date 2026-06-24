"""Market Basket endpoints — FP-Growth rules, bundle builder, campaign bridge."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from citipoints_api.schemas import (
    BundleRecommendation,
    Insight,
    InsightBundle,
    MarketBasketRule,
)
from citipoints_api.services import ml_models
from citipoints_api.services.insights import basket_insights, now_iso

router = APIRouter(prefix="/market-basket")


def _to_list(frozen: frozenset[str] | set[str] | list[str]) -> list[str]:
    return sorted(frozen)


@router.get("/rules", response_model=list[MarketBasketRule])
def get_rules(
    by_category: bool = Query(default=False),
    min_support: float = Query(default=0.02, ge=0.005, le=0.20),
    min_confidence: float = Query(default=0.3, ge=0.05, le=0.95),
    limit: int = Query(default=30, ge=1, le=200),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> list[MarketBasketRule]:
    result = ml_models.run_fpgrowth(
        by_category=by_category,
        min_support=min_support,
        min_confidence=min_confidence,
        date_from=date_from,
        date_to=date_to,
    )
    rules = result.rules.head(limit)
    return [
        MarketBasketRule(
            antecedents=_to_list(row.antecedents),
            consequents=_to_list(row.consequents),
            antecedents_label=row.antecedents_label,
            consequents_label=row.consequents_label,
            support=float(row.support),
            confidence=float(row.confidence),
            lift=float(row.lift),
        )
        for row in rules.itertuples(index=False)
    ]


@router.get("/bundles/{anchor}", response_model=list[BundleRecommendation])
def get_bundle(
    anchor: str, limit: int = Query(default=5, ge=1, le=20)
) -> list[BundleRecommendation]:
    bundles = ml_models.bundle_for(anchor, limit=limit)
    if bundles.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No bundle companions found for anchor '{anchor}'",
        )
    out: list[BundleRecommendation] = []
    for row in bundles.itertuples(index=False):
        companion = " + ".join(sorted(row.consequents))
        brief = (
            f"Launch '{anchor} + {companion}' bundle at 10% off for 14 days. "
            f"Expected lift {row.lift:.2f}x — target Silver+Gold tiers in Dubai Marina & Downtown."
        )
        out.append(
            BundleRecommendation(
                anchor=anchor,
                companion=companion,
                lift=float(row.lift),
                confidence=float(row.confidence),
                support=float(row.support),
                campaign_brief=brief,
            ),
        )
    return out


@router.get("/insights", response_model=InsightBundle)
def basket_insights_route() -> InsightBundle:
    rules = ml_models.run_fpgrowth().rules
    insights = basket_insights(rules)
    return InsightBundle(
        page="market-basket",
        generated_at=now_iso(),
        question="Which products should we bundle next?",
        insights=insights,
    )
