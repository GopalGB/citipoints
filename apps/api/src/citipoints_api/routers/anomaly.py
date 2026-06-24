"""Anomaly detection on the daily revenue time series.

Adds an agentic `/anomaly/explain` endpoint that ranks dimension contributors
to a flagged day, then asks Claude for a natural-language root-cause narrative
grounded in the warehouse numbers. Anti-hallucination PRINCIPLE_BLOCK is
prepended; confidence < 0.70 triggers abstention.
"""

from __future__ import annotations

import json
import math
import sys
import textwrap
import time
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from citipoints_api.data.store import fetch_df
from citipoints_api.logging_conf import get_logger
from citipoints_api.schemas import AnomalyPoint, ORMBase
from citipoints_api.services import ml_models
from citipoints_api.services.claude_cli import (
    ClaudeCliError,
    extract_json_block,
    run_claude,
)

# MAX HQ anti-hallucination helper (Rule 1 principle block + Rule 7 SQLite log)
_MAX_UTILS = "/Users/gopalmacbook/Desktop/Max HQ/.max/utils"
if _MAX_UTILS not in sys.path:
    sys.path.insert(0, _MAX_UTILS)
try:
    from anti_hallucination import PRINCIPLE_BLOCK, log_llm_call  # type: ignore
except Exception:  # pragma: no cover — don't break endpoint if helper missing
    PRINCIPLE_BLOCK = ""

    def log_llm_call(**_kwargs):  # noqa: D401
        return None


router = APIRouter(prefix="/anomaly")
logger = get_logger(__name__)


# ── Request / Response schemas ─────────────────────────────────────────


Metric = Literal["revenue", "members", "redemptions"]
DimensionKind = Literal["partner", "store", "region"]
Confidence = Literal["high", "medium", "low"]


class AnomalyExplainRequest(BaseModel):
    date: str = Field(..., description="ISO date YYYY-MM-DD")
    metric: Metric = "revenue"
    deviation_pct: float = Field(..., description="Signed percentage deviation vs expected")


class AnomalySuspect(ORMBase):
    dimension: DimensionKind
    value: str
    contribution_aed: float
    contribution_pct: float


class AnomalyExplainResponse(ORMBase):
    date: str
    metric: Metric
    summary: str
    root_cause: str
    suspect_dimensions: list[AnomalySuspect]
    sql_used: str
    confidence: Confidence
    abstained: bool = False


SYSTEM_PROMPT_EXPLAIN = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
        You are the CITI Points anomaly-explain agent for the Nexus / Acme Retail
        loyalty coalition. You receive a JSON payload containing:
          * the flagged date and metric
          * the top-N dimension contributors ranked by contribution vs a 7-day
            moving average baseline
          * the SQL that produced the contributors

        Your job: write a short, data-grounded root-cause narrative. You MUST
        cite specific AED amounts and percentages that appear in the payload.
        Never invent partners, stores, or regions that are not in the payload.
        If the numbers do not support a single root cause, say so honestly and
        mark confidence accordingly.

        Respond with a SINGLE JSON object (no markdown fences, no prose):

        {
          "summary": "<1-2 sentence executive summary>",
          "root_cause": "<2-4 sentence root-cause hypothesis with citations>",
          "confidence": "high" | "medium" | "low",
          "confidence_score": <float 0.0-1.0>
        }

        Confidence rules:
          * high (>=0.85) — one dimension explains >50% of the deviation
          * medium (0.70-0.84) — top-3 dimensions together explain >50%
          * low (<0.70) — deviation is diffuse; ABSTAIN
        """
    ).strip()
)


# ── Existing endpoint ─────────────────────────────────────────────────


def _clean_reason(raw: object) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, float) and math.isnan(raw):
        return None
    text = str(raw)
    return text if text and text.lower() != "nan" else None


@router.get("/daily-revenue", response_model=list[AnomalyPoint])
def daily_revenue(
    z: float = Query(default=2.5, ge=1.5, le=4.0),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> list[AnomalyPoint]:
    result = ml_models.run_daily_anomaly(z_threshold=z, date_from=date_from, date_to=date_to)
    if result.rows.empty:
        return []
    return [
        AnomalyPoint(
            date=row.date.date() if hasattr(row.date, "date") else row.date,
            revenue=float(row.revenue),
            expected=float(row.expected),
            residual=float(row.residual),
            is_anomaly=bool(row.is_anomaly),
            reason=_clean_reason(row.reason),
        )
        for row in result.rows.itertuples(index=False)
    ]


# ── Agentic explain endpoint ──────────────────────────────────────────


_MA_WINDOW_DAYS = 7
_SUSPECT_LIMIT = 6
_PARTNER_ALIASES = {
    "Acme Retail": ["acme", "choi"],
    "Lulu": ["lulu"],
    "Carrefour": ["carrefour"],
    "Spinneys": ["spinneys"],
    "EROS": ["eros"],
}
_REGION_ALIASES = {
    "Dubai": ["dubai", "jumeirah", "downtown", "marina", "deira"],
    "Abu Dhabi": ["abu dhabi", "auh", "khalifa"],
    "Sharjah": ["sharjah"],
    "Ajman": ["ajman"],
    "Other UAE": ["ras al khaimah", "fujairah", "umm al quwain"],
}


def _derive_partner(store: str) -> str:
    """Map a store name to a coalition partner. Falls back to 'Acme Retail' —
    the anchor partner — when no brand keyword is present (the demo warehouse
    stores are all Acme Retail locations)."""
    lowered = (store or "").lower()
    for partner, needles in _PARTNER_ALIASES.items():
        if any(n in lowered for n in needles):
            return partner
    return "Acme Retail"


def _derive_region(store: str) -> str:
    lowered = (store or "").lower()
    for region, needles in _REGION_ALIASES.items():
        if any(n in lowered for n in needles):
            return region
    return "Other UAE"


def _metric_expression(metric: Metric) -> str:
    if metric == "revenue":
        return "COALESCE(SUM(amount), 0)"
    if metric == "redemptions":
        return "COALESCE(SUM(points_redeemed), 0)"
    # members
    return "COUNT(DISTINCT customer_id)"


def _dimension_sql(target_date: date, metric: Metric) -> str:
    """SQL that returns per-store contribution on the target date AND the 7-day MA baseline."""
    expr = _metric_expression(metric)
    lo = (target_date - timedelta(days=_MA_WINDOW_DAYS)).isoformat()
    hi_excl = target_date.isoformat()
    return f"""
    WITH day_metric AS (
        SELECT store, {expr} AS value
        FROM transactions
        WHERE date = DATE '{target_date.isoformat()}'
        GROUP BY store
    ),
    baseline AS (
        SELECT store, {expr} / {_MA_WINDOW_DAYS}.0 AS ma_value
        FROM transactions
        WHERE date >= DATE '{lo}' AND date < DATE '{hi_excl}'
        GROUP BY store
    )
    SELECT
        COALESCE(d.store, b.store) AS store,
        COALESCE(d.value, 0)       AS value,
        COALESCE(b.ma_value, 0)    AS baseline,
        COALESCE(d.value, 0) - COALESCE(b.ma_value, 0) AS delta
    FROM day_metric d
    FULL OUTER JOIN baseline b ON b.store = d.store
    ORDER BY ABS(delta) DESC
    LIMIT 40
    """


def _aggregate_suspects(rows, signed_target: float) -> list[AnomalySuspect]:
    """Aggregate store-level rows into partner/store/region and pick the top suspects.

    `signed_target` is the total deviation magnitude used to compute contribution_pct.
    """
    if not rows or signed_target == 0:
        return []
    # Only keep rows whose delta shares the same sign as the overall deviation —
    # those are the contributors. Opposite-sign stores are offsetting noise.
    sign = 1 if signed_target > 0 else -1
    contributors = [r for r in rows if (r["delta"] or 0) * sign > 0]
    if not contributors:
        contributors = rows

    by_store: dict[str, float] = {}
    by_partner: dict[str, float] = {}
    by_region: dict[str, float] = {}
    for r in contributors:
        store = str(r["store"] or "Unknown")
        delta = float(r["delta"] or 0)
        by_store[store] = by_store.get(store, 0) + delta
        by_partner[_derive_partner(store)] = by_partner.get(_derive_partner(store), 0) + delta
        by_region[_derive_region(store)] = by_region.get(_derive_region(store), 0) + delta

    def _pick(d: dict[str, float], dim: DimensionKind) -> list[AnomalySuspect]:
        ordered = sorted(d.items(), key=lambda kv: abs(kv[1]), reverse=True)
        out: list[AnomalySuspect] = []
        for value, delta in ordered[:3]:
            pct = (delta / signed_target * 100.0) if signed_target else 0.0
            out.append(
                AnomalySuspect(
                    dimension=dim,
                    value=value,
                    contribution_aed=round(float(delta), 2),
                    contribution_pct=round(float(pct), 2),
                )
            )
        return out

    suspects: list[AnomalySuspect] = []
    suspects.extend(_pick(by_partner, "partner"))
    suspects.extend(_pick(by_store, "store"))
    suspects.extend(_pick(by_region, "region"))
    # Trim to the most informative N, preserving order (partners first).
    return suspects[:_SUSPECT_LIMIT]


def _confidence_from_suspects(suspects: list[AnomalySuspect]) -> tuple[Confidence, float]:
    """Heuristic confidence: concentration of deviation in the top-1 / top-3 suspects."""
    partner_level = [s for s in suspects if s.dimension == "partner"]
    if not partner_level:
        return "low", 0.5
    top1 = abs(partner_level[0].contribution_pct)
    top3 = sum(abs(s.contribution_pct) for s in partner_level[:3])
    if top1 >= 50:
        return "high", min(0.95, 0.75 + top1 / 200.0)
    if top3 >= 50:
        return "medium", 0.75
    return "low", 0.55


def _fallback_narrative(
    target_date: str,
    metric: Metric,
    deviation_pct: float,
    suspects: list[AnomalySuspect],
) -> tuple[str, str]:
    direction = "above" if deviation_pct >= 0 else "below"
    if not suspects:
        return (
            f"{metric.title()} on {target_date} was {abs(deviation_pct):.1f}% {direction} its 7-day baseline.",
            "No single partner, store, or region concentrated the deviation — the signal is diffuse across the coalition.",
        )
    top = suspects[0]
    return (
        f"{metric.title()} on {target_date} was {abs(deviation_pct):.1f}% {direction} baseline.",
        (
            f"The largest contributor is {top.dimension} {top.value} "
            f"(AED {top.contribution_aed:,.0f}, {top.contribution_pct:+.1f}% of the deviation). "
            f"Review that {top.dimension}'s operations and promo calendar on {target_date}."
        ),
    )


@router.post("/explain", response_model=AnomalyExplainResponse)
async def explain_anomaly(req: AnomalyExplainRequest) -> AnomalyExplainResponse:
    # Parse + validate date
    try:
        target_date = date.fromisoformat(req.date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date: {exc}") from exc

    sql = _dimension_sql(target_date, req.metric).strip()
    try:
        df = fetch_df(sql)
    except Exception as exc:  # pragma: no cover — surface warehouse failure cleanly
        logger.warning("anomaly.explain.sql_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Warehouse query failed") from exc

    rows = df.to_dict("records")
    # signed_target — total deviation across all stores (matches the reported deviation sign)
    signed_target = float(sum(float(r["delta"] or 0) for r in rows)) or 0.0
    if signed_target == 0 and req.deviation_pct:
        # If the warehouse doesn't have rows for the target date at all, fall back
        # to the caller-provided deviation as the magnitude anchor (sign only).
        signed_target = 1.0 if req.deviation_pct > 0 else -1.0

    suspects = _aggregate_suspects(rows, signed_target)
    confidence, confidence_score = _confidence_from_suspects(suspects)

    # Compose the LLM payload. Keep it tight — Claude only needs the ranked contributors.
    llm_payload = {
        "date": req.date,
        "metric": req.metric,
        "deviation_pct": req.deviation_pct,
        "baseline_window_days": _MA_WINDOW_DAYS,
        "suspects": [s.model_dump() for s in suspects],
        "sql_used": sql,
    }

    summary = ""
    root_cause = ""
    t0 = time.time()
    try:
        result = await run_claude(
            json.dumps(llm_payload, default=str),
            system=SYSTEM_PROMPT_EXPLAIN,
        )
        parsed = extract_json_block(result.text) or {}
        summary = str(parsed.get("summary") or "").strip()
        root_cause = str(parsed.get("root_cause") or "").strip()
        claude_conf = str(parsed.get("confidence") or "").lower()
        claude_score = float(parsed.get("confidence_score") or 0.0)
        # If Claude says low but numbers say high (or vice versa), take the MORE conservative.
        if claude_conf in {"high", "medium", "low"}:
            order = {"high": 3, "medium": 2, "low": 1}
            if order[claude_conf] < order[confidence]:
                confidence = claude_conf  # type: ignore[assignment]
        if 0.0 <= claude_score <= 1.0:
            confidence_score = min(confidence_score, claude_score)
        log_llm_call(
            skill="citipoints:anomaly-explain",
            model=result.model,
            prompt=req.date,
            output=result.text,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=False,
            confidence=claude_score,
        )
    except ClaudeCliError as exc:
        logger.warning("anomaly.explain.cli_error", error=str(exc))
        log_llm_call(
            skill="citipoints:anomaly-explain",
            model="claude-cli",
            prompt=req.date,
            output=None,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=True,
            error=str(exc),
        )
    except Exception as exc:  # noqa: BLE001 — never 500 on this endpoint
        logger.warning("anomaly.explain.unexpected", error=str(exc))

    # Fill in fallback prose if Claude failed or abstained.
    if not summary or not root_cause:
        summary, root_cause = _fallback_narrative(req.date, req.metric, req.deviation_pct, suspects)

    abstained = confidence_score < 0.70 or confidence == "low"
    if abstained:
        root_cause = (
            "Confidence below 0.70 — abstaining from a single-cause narrative. " + root_cause
        )

    return AnomalyExplainResponse(
        date=req.date,
        metric=req.metric,
        summary=summary,
        root_cause=root_cause,
        suspect_dimensions=suspects,
        sql_used=sql,
        confidence=confidence,
        abstained=abstained,
    )
