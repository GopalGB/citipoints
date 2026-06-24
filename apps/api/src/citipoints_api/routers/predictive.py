"""Predictive analytics — churn, CLV, Act Now list."""

from __future__ import annotations

from fastapi import APIRouter, Query

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import (
    ActNowCustomer,
    ChurnMetrics,
    ChurnResponse,
    ChurnScore,
    ClvPrediction,
    ClvResponse,
    FeatureImportance,
    InsightBundle,
)
from citipoints_api.services import ml_models
from citipoints_api.services.insights import churn_insights, now_iso

router = APIRouter(prefix="/predictive")


@router.get("/churn", response_model=ChurnResponse)
def churn(limit: int = Query(default=50, ge=1, le=500)) -> ChurnResponse:
    result = ml_models.run_churn()
    high = result.scores[result.scores["risk_band"] == "High"].head(limit)
    samples = [
        ChurnScore(
            customer_id=row.customer_id,
            churn_probability=float(row.churn_probability),
            risk_band=row.risk_band,
        )
        for row in high.itertuples(index=False)
    ]
    metrics = ChurnMetrics(
        auc_roc=round(result.metrics["auc_roc"], 4),
        precision=round(result.metrics["precision"], 4),
        recall=round(result.metrics["recall"], 4),
        churn_rate=round(result.metrics["churn_rate"], 4),
        engine=result.metrics.get("engine", "unknown") if isinstance(result.metrics, dict) else "unknown",
    )
    top_features = [
        FeatureImportance(feature=str(f["feature"]), importance=float(f["importance"]))
        for f in result.top_features
    ]
    return ChurnResponse(metrics=metrics, top_features=top_features, high_risk_sample=samples)


@router.get("/clv", response_model=ClvResponse)
def clv(limit: int = Query(default=200, ge=1, le=5000)) -> ClvResponse:
    result = ml_models.run_clv()
    preds = result.predictions.head(limit)
    items = [
        ClvPrediction(
            customer_id=row.customer_id,
            predicted_clv_12m=float(row.predicted_clv_12m),
            retention_probability=float(row.retention_probability),
            clv_tier=row.clv_tier,
        )
        for row in preds.itertuples(index=False)
    ]
    return ClvResponse(predictions=items, summary=result.summary)


@router.get("/act-now", response_model=list[ActNowCustomer])
def act_now(limit: int = Query(default=50, ge=1, le=200)) -> list[ActNowCustomer]:
    act = ml_models.act_now_list(limit=limit)
    if act.empty:
        return []
    custs = fetch_df(
        "SELECT customer_id, name, tier FROM customers WHERE customer_id IN (SELECT UNNEST($ids))",
        {"ids": act["customer_id"].tolist()},
    )
    cust_map = {c.customer_id: c for c in custs.itertuples(index=False)}
    out: list[ActNowCustomer] = []
    for row in act.itertuples(index=False):
        info = cust_map.get(row.customer_id)
        if info is None:
            continue
        out.append(
            ActNowCustomer(
                customer_id=row.customer_id,
                name=info.name,
                tier=info.tier,
                churn_probability=float(row.churn_probability),
                predicted_clv_12m=float(row.predicted_clv_12m),
                urgency_score=float(row.urgency_score),
                suggested_action=ml_models.suggest_action(
                    churn_probability=float(row.churn_probability),
                    predicted_clv_12m=float(row.predicted_clv_12m),
                ),
            ),
        )
    return out


@router.get("/insights", response_model=InsightBundle)
def predictive_insights() -> InsightBundle:
    churn_result = ml_models.run_churn()
    high_risk = churn_result.scores[churn_result.scores["risk_band"] == "High"]
    revenue = float(high_risk["total_spend"].sum()) if not high_risk.empty else 0.0
    insights = churn_insights(
        high_risk_count=len(high_risk),
        high_risk_revenue=revenue,
        auc=churn_result.metrics.get("auc_roc", 0.0),
    )
    return InsightBundle(
        page="predictive",
        generated_at=now_iso(),
        question="Who is about to leave, and how much revenue is walking out the door?",
        insights=insights,
    )
