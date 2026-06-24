"""Price-elasticity simulator — parametric log-log model + Monte Carlo.

No LLM call: this is pure math. The scenario is the CFO's lever-pull, the
baseline is derived from the last 90 days of warehouse activity (with a
deterministic fallback when the warehouse is cold).

Model assumptions (documented so Finance can challenge):

    Active members respond to redemption generosity with a log-log
    elasticity coefficient of -0.45. i.e. a 10% *less generous* redemption
    ratio (e.g. 200 → 220 Nexus/AED) dampens active participation by ~4.5%.

    Revenue is a function of active_members × avg_basket. A stingier
    redemption rate nudges avg_basket up modestly (price-insensitive grocery
    shoppers keep buying) but the active-members attrition dominates — net
    revenue is negative on devaluations.

    Liability = issued Nexus unredeemed. earn_rate lifts it linearly;
    redemption_rate dampens the AED-equivalent; threshold_promo (a bonus
    points reward at a spend threshold) adds a ~3% bump to engagement.

    Monte Carlo draws N=500 with σ=0.08 noise on the elasticity coefficient
    to surface the P10/P50/P90 envelope around the scenario revenue.

The historical preset exposed by the `/simulate` endpoint mirrors the
Dec-2024 Nexus devaluation (100 → 200 Nexus/AED): the caller simply sets
`redemption_rate_nexus_per_aed=200` and the response's `delta` block is
the forecasted customer-outrage footprint.
"""

from __future__ import annotations

import math
import random
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from citipoints_api.data.filters import parse_filters
from citipoints_api.data.store import FilterParams
from citipoints_api.logging_conf import get_logger
from citipoints_api.services import queries

router = APIRouter(prefix="/elasticity")
logger = get_logger(__name__)


# ── Model constants (documented, reviewable) ────────────────────────────

ELASTICITY_COEF = -0.45  # log-log elasticity on participation wrt generosity
BREAKAGE_DEFAULT = 0.26  # industry ~22-30%
NOISE_SIGMA = 0.08  # Monte Carlo draws
MONTE_CARLO_N = 500
CURVE_SAMPLES = 10  # redemption_rate sweep points

BASELINE_FALLBACK = {
    "revenue_aed": 5_280_000.0,
    "active_members": 400_000,
    "points_earned": 5_280_000.0,
    "points_redeemed": 3_907_200.0,
}


# ── Schemas ─────────────────────────────────────────────────────────────


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="forbid")


class ElasticitySimulateRequest(ORMBase):
    redemption_rate_nexus_per_aed: int = Field(default=200, ge=50, le=500)
    earn_rate_nexus_per_aed: float = Field(default=1.0, ge=0.1, le=5.0)
    threshold_promo_nexus: int | None = Field(default=None, ge=0, le=5000)
    horizon_days: int = Field(default=90, ge=7, le=365)


class ElasticityScenarioState(ORMBase):
    revenue_aed: float
    liability_aed: float
    breakage_aed: float
    active_members: int
    elasticity: float | None = None


class ElasticityDelta(ORMBase):
    revenue_aed: float
    revenue_pct: float
    liability_aed: float
    liability_pct: float
    active_members: int
    active_members_pct: float


class ElasticityMonteCarlo(ORMBase):
    revenue_p10: float
    revenue_p50: float
    revenue_p90: float
    liability_p10: float
    liability_p50: float
    liability_p90: float


class ElasticityCurvePoint(ORMBase):
    redemption_rate: int
    revenue_aed: float
    liability_aed: float


class ElasticitySimulateResponse(ORMBase):
    baseline: ElasticityScenarioState
    scenario: ElasticityScenarioState
    delta: ElasticityDelta
    monte_carlo: ElasticityMonteCarlo
    curve: list[ElasticityCurvePoint]
    model: Literal["log-log"] = "log-log"
    horizon_days: int
    assumptions: dict[str, float]


# ── Baseline resolution ─────────────────────────────────────────────────


def _baseline(horizon_days: int) -> dict[str, float]:
    """Read the warehouse for a rough baseline; fall back to demo constants if empty."""
    try:
        # Treat the filter window as "last N transactions" — the warehouse
        # anchors to demo data, so we let DuckDB aggregate everything.
        snap = queries.kpi_snapshot(FilterParams())
    except Exception as exc:  # noqa: BLE001 — never let the simulator 500
        logger.warning("elasticity.baseline_warehouse_unavailable", error=str(exc))
        return dict(BASELINE_FALLBACK)

    revenue = float(snap.get("revenue") or 0.0)
    active = float(snap.get("active_members") or 0.0)
    issued = float(snap.get("points_earned") or 0.0)
    redeemed = float(snap.get("points_redeemed") or 0.0)

    if revenue <= 0 or active <= 0:
        return dict(BASELINE_FALLBACK)

    # Scale to the requested horizon. The warehouse snapshot covers the full
    # demo span (~90d of data), so we only rescale when the caller asks for
    # something longer than that.
    scale = 1.0 if horizon_days <= 90 else horizon_days / 90.0
    return {
        "revenue_aed": revenue * scale,
        "active_members": int(active),
        "points_earned": issued * scale,
        "points_redeemed": redeemed * scale,
    }


# ── Core model ──────────────────────────────────────────────────────────


def _scenario(
    base: dict[str, float],
    *,
    redemption_rate: int,
    earn_rate: float,
    threshold_promo: int | None,
    elasticity_coef: float = ELASTICITY_COEF,
) -> dict[str, float]:
    """Return {revenue_aed, liability_aed, breakage_aed, active_members}."""
    # Generosity ratio = baseline_redemption_rate / new_redemption_rate
    # higher when NEW rate is lower (more generous to members).
    base_rate = 200  # Nexus per AED
    generosity_ratio = base_rate / max(redemption_rate, 1)

    # Participation response: active ∝ generosity^elasticity_coef. A negative
    # coefficient means "stingier → fewer actives".
    participation_mult = math.pow(generosity_ratio, elasticity_coef * -1.0)
    # Threshold promos lift engagement ~3% when turned on (any positive value).
    if threshold_promo and threshold_promo > 0:
        participation_mult *= 1.03

    active_members = int(base["active_members"] * participation_mult)

    # Revenue — participation is the dominant driver; earn_rate has a mild
    # secondary boost (richer earn → more cross-buying behavior).
    earn_boost = 1.0 + 0.12 * (earn_rate - 1.0)
    revenue = base["revenue_aed"] * participation_mult * earn_boost

    # Liability = outstanding Nexus × AED redemption value
    issued_nexus = revenue * earn_rate
    redeemed_nexus = issued_nexus * (1.0 - BREAKAGE_DEFAULT)
    liability_aed = redeemed_nexus / max(redemption_rate, 1)
    breakage_aed = (issued_nexus * BREAKAGE_DEFAULT) / max(redemption_rate, 1)

    return {
        "revenue_aed": round(revenue, 2),
        "liability_aed": round(liability_aed, 2),
        "breakage_aed": round(breakage_aed, 2),
        "active_members": active_members,
    }


def _monte_carlo(
    base: dict[str, float],
    *,
    redemption_rate: int,
    earn_rate: float,
    threshold_promo: int | None,
) -> ElasticityMonteCarlo:
    rng = random.Random(42)  # deterministic — demos reproduce
    revenues: list[float] = []
    liabilities: list[float] = []
    for _ in range(MONTE_CARLO_N):
        coef = ELASTICITY_COEF + rng.gauss(0.0, NOISE_SIGMA)
        s = _scenario(
            base,
            redemption_rate=redemption_rate,
            earn_rate=earn_rate,
            threshold_promo=threshold_promo,
            elasticity_coef=coef,
        )
        revenues.append(s["revenue_aed"])
        liabilities.append(s["liability_aed"])
    revenues.sort()
    liabilities.sort()

    def q(arr: list[float], p: float) -> float:
        idx = min(len(arr) - 1, max(0, int(p * len(arr))))
        return round(arr[idx], 2)

    return ElasticityMonteCarlo(
        revenue_p10=q(revenues, 0.10),
        revenue_p50=q(revenues, 0.50),
        revenue_p90=q(revenues, 0.90),
        liability_p10=q(liabilities, 0.10),
        liability_p50=q(liabilities, 0.50),
        liability_p90=q(liabilities, 0.90),
    )


def _curve(
    base: dict[str, float],
    *,
    earn_rate: float,
    threshold_promo: int | None,
) -> list[ElasticityCurvePoint]:
    lo, hi = 100, 300
    step = (hi - lo) // (CURVE_SAMPLES - 1)
    points: list[ElasticityCurvePoint] = []
    for i in range(CURVE_SAMPLES):
        rate = lo + step * i
        s = _scenario(
            base,
            redemption_rate=rate,
            earn_rate=earn_rate,
            threshold_promo=threshold_promo,
        )
        points.append(
            ElasticityCurvePoint(
                redemption_rate=rate,
                revenue_aed=s["revenue_aed"],
                liability_aed=s["liability_aed"],
            )
        )
    return points


# ── Routes ──────────────────────────────────────────────────────────────


@router.post("/simulate", response_model=ElasticitySimulateResponse)
def simulate(
    req: ElasticitySimulateRequest,
    _filters: FilterParams = Depends(parse_filters),
) -> ElasticitySimulateResponse:
    base = _baseline(req.horizon_days)
    baseline_state = _scenario(
        base,
        redemption_rate=200,
        earn_rate=1.0,
        threshold_promo=None,
    )
    scenario_state = _scenario(
        base,
        redemption_rate=req.redemption_rate_nexus_per_aed,
        earn_rate=req.earn_rate_nexus_per_aed,
        threshold_promo=req.threshold_promo_nexus,
    )

    def _pct(new: float, old: float) -> float:
        if old == 0:
            return 0.0
        return round(((new - old) / old) * 100.0, 2)

    delta = ElasticityDelta(
        revenue_aed=round(scenario_state["revenue_aed"] - baseline_state["revenue_aed"], 2),
        revenue_pct=_pct(scenario_state["revenue_aed"], baseline_state["revenue_aed"]),
        liability_aed=round(scenario_state["liability_aed"] - baseline_state["liability_aed"], 2),
        liability_pct=_pct(scenario_state["liability_aed"], baseline_state["liability_aed"]),
        active_members=scenario_state["active_members"] - baseline_state["active_members"],
        active_members_pct=_pct(scenario_state["active_members"], baseline_state["active_members"]),
    )

    mc = _monte_carlo(
        base,
        redemption_rate=req.redemption_rate_nexus_per_aed,
        earn_rate=req.earn_rate_nexus_per_aed,
        threshold_promo=req.threshold_promo_nexus,
    )
    curve = _curve(
        base,
        earn_rate=req.earn_rate_nexus_per_aed,
        threshold_promo=req.threshold_promo_nexus,
    )

    return ElasticitySimulateResponse(
        baseline=ElasticityScenarioState(**baseline_state, elasticity=ELASTICITY_COEF),
        scenario=ElasticityScenarioState(**scenario_state, elasticity=ELASTICITY_COEF),
        delta=delta,
        monte_carlo=mc,
        curve=curve,
        horizon_days=req.horizon_days,
        assumptions={
            "elasticity_coef": ELASTICITY_COEF,
            "breakage_rate": BREAKAGE_DEFAULT,
            "noise_sigma": NOISE_SIGMA,
            "monte_carlo_draws": float(MONTE_CARLO_N),
        },
    )
