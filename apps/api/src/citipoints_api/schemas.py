"""Pydantic response schemas shared across routers."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Tier = Literal["Platinum", "Gold", "Silver", "Bronze"]
InsightPriority = Literal["info", "opportunity", "warning", "critical"]


class ORMBase(BaseModel):
    """Strict base for response models."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="forbid")


class SparkPoint(ORMBase):
    x: str
    y: float


class KpiTile(ORMBase):
    id: str
    label: str
    value: float
    value_display: str
    delta_pct: float | None = None
    delta_direction: Literal["up", "down", "flat"] = "flat"
    trend: list[SparkPoint] = Field(default_factory=list)
    sentiment: Literal["positive", "negative", "neutral"] = "neutral"


class KpiResponse(ORMBase):
    period_label: str
    generated_at: str
    tiles: list[KpiTile]


class TrendPoint(ORMBase):
    date: date
    revenue: float
    transactions: int


class TrendResponse(ORMBase):
    series: list[TrendPoint]


class CategoryMixItem(ORMBase):
    category: str
    revenue: float
    share_pct: float


class StorePerfItem(ORMBase):
    store: str
    revenue: float
    transactions: int
    avg_basket: float


class TierDistItem(ORMBase):
    tier: Tier
    members: int
    revenue: float
    share_pct: float


class TopProductItem(ORMBase):
    sku_id: str
    product_name: str
    brand: str
    category: str
    revenue: float
    units: int


class Insight(ORMBase):
    id: str
    title: str
    text: str
    priority: InsightPriority
    icon: str
    action: str | None = None
    evidence_chart_id: str | None = None


class InsightBundle(ORMBase):
    page: str
    generated_at: str
    question: str
    insights: list[Insight]


class MarketBasketRule(ORMBase):
    antecedents: list[str]
    consequents: list[str]
    antecedents_label: str
    consequents_label: str
    support: float
    confidence: float
    lift: float


class BundleRecommendation(ORMBase):
    anchor: str
    companion: str
    lift: float
    confidence: float
    support: float
    campaign_brief: str | None = None


class RfmSegment(ORMBase):
    customer_id: str
    recency: int
    frequency: int
    monetary: float
    rfm_score: str
    segment: str
    predicted_cluster: int


class RfmSummary(ORMBase):
    segments: list[RfmSegment]
    silhouette_score: float
    persona_counts: dict[str, int]


class TierMigrationLink(ORMBase):
    source_tier: Tier
    target_tier: Tier
    members: int


class TierMigrationHeadline(ORMBase):
    """Data-driven summary the page uses as its H1 subtitle."""

    text: str
    tone: Literal["positive", "negative", "neutral"]


class TierMigrationResponse(ORMBase):
    """Rich period-over-period migration matrix with dynamic insights."""

    period_a_label: str
    period_b_label: str
    period_a_start: date
    period_a_end: date
    period_b_start: date
    period_b_end: date
    matrix: list[TierMigrationLink]
    total_tracked: int
    up_migrators: int
    down_migrators: int
    static_members: int
    up_pct: float
    down_pct: float
    biggest_drop_route: str | None = None
    biggest_drop_members: int = 0
    biggest_lift_route: str | None = None
    biggest_lift_members: int = 0
    headline: TierMigrationHeadline


FraudKind = Literal[
    "velocity",
    "bulk_redeem",
    "tier_farming",
    "partner_collision",
    "redeem_abuse",
]
FraudSeverity = Literal["low", "medium", "high"]


class FraudFlag(ORMBase):
    id: str
    member: str
    kind: FraudKind
    severity: FraudSeverity
    score: float
    explanation: str
    loss_aed: float
    detected_on: date


class FraudHeadline(ORMBase):
    text: str
    tone: Literal["positive", "negative", "neutral"]


class FraudSummary(ORMBase):
    window_label: str
    total_flags: int
    high_severity: int
    medium_severity: int
    low_severity: int
    exposure_aed: float
    kind_breakdown: dict[str, int]
    flags: list[FraudFlag]
    headline: FraudHeadline


class ForecastPoint(ORMBase):
    month: str  # "Mar 26" style label
    iso_date: date
    revenue_actual: float | None = None
    revenue_forecast: float
    revenue_lo: float
    revenue_hi: float
    liability_forecast: float
    ramadan: bool = False


class ForecastHeadline(ORMBase):
    text: str
    tone: Literal["positive", "negative", "neutral"]


class ForecastResponse(ORMBase):
    actuals_total_aed: float
    next_6mo_aed: float
    peak_month: str
    peak_value_aed: float
    liability_peak_aed: float
    series: list[ForecastPoint]
    headline: ForecastHeadline
    model_engine: str  # "holt-winters" | "linear" | "naive"


class ChurnScore(ORMBase):
    customer_id: str
    churn_probability: float
    risk_band: Literal["High", "Medium", "Low"]


class FeatureImportance(ORMBase):
    feature: str
    importance: float


class ChurnMetrics(ORMBase):
    auc_roc: float
    precision: float
    recall: float
    churn_rate: float
    engine: str = "unknown"


class ChurnResponse(ORMBase):
    metrics: ChurnMetrics
    top_features: list[FeatureImportance]
    high_risk_sample: list[ChurnScore]


class ClvPrediction(ORMBase):
    customer_id: str
    predicted_clv_12m: float
    retention_probability: float
    clv_tier: Literal["Premium", "High", "Medium", "Low"]


class ClvResponse(ORMBase):
    predictions: list[ClvPrediction]
    summary: dict[str, float]


class ActNowCustomer(ORMBase):
    customer_id: str
    name: str
    tier: Tier
    churn_probability: float
    predicted_clv_12m: float
    urgency_score: float
    suggested_action: str


class Recommendation(ORMBase):
    sku_id: str
    product_name: str
    score: float
    reason: str


class RecommendationBundle(ORMBase):
    customer_id: str
    generated_at: str
    recommendations: list[Recommendation]


class ChatMessage(ORMBase):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(ORMBase):
    question: str = Field(min_length=2, max_length=600)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatAuditTrail(ORMBase):
    retrieved_tables: list[str]
    executed_sql: str | None
    row_count: int | None


class ChatResponse(ORMBase):
    question: str
    answer: str
    audit: ChatAuditTrail
    follow_ups: list[str]


class NextBestAction(ORMBase):
    customer_id: str
    action: str
    rationale: str
    expected_uplift_aed: float


class CohortCell(ORMBase):
    cohort_month: str
    month_offset: int
    active_rate: float
    active_count: int
    cohort_size: int


class AnomalyPoint(ORMBase):
    date: date
    revenue: float
    expected: float
    residual: float
    is_anomaly: bool
    reason: str | None = None


class HealthResponse(ORMBase):
    status: Literal["ok", "degraded"]
    checks: dict[str, str]
    version: str


# ── COO (Coalition Operations) ──────────────────────────────────────
# Ops telemetry for the /executive COO lens. Values that come from the
# analytics warehouse are marked `source: "warehouse"`; values sourced
# from external systems not yet wired (APM, Zendesk, PDPL tool) are
# marked `source: "demo"` — the UI surfaces a chip so nothing pretends
# to be live when it isn't.


class CooMetric(ORMBase):
    key: str
    label: str
    value: float
    value_display: str
    caption: str | None = None
    source: Literal["warehouse", "demo", "runtime"]


class CooSystemHealth(ORMBase):
    generated_at: str
    window_label: str
    metrics: list[CooMetric]


class CooPartner(ORMBase):
    name: str
    earn_index: int  # 0-100 indexed to the top partner
    redemption_index: int  # 0-100 indexed to the top partner
    sla_pct: float
    health: Literal["green", "amber", "red"]
    txns_window: int
    earn_delta_wow_pct: float | None = None


class CooPartnersResponse(ORMBase):
    generated_at: str
    window_label: str
    partners: list[CooPartner]
    hhi: int  # Herfindahl-Hirschman index on earn concentration


class CooFunnelStage(ORMBase):
    stage: str
    count: int
    rate_pct: float  # 0-100 percent of enrolled base
    target_pct: float  # target conversion for this stage
    median_days: int | None  # median days to reach this stage


class CooLifecycleFunnel(ORMBase):
    generated_at: str
    window_label: str
    stages: list[CooFunnelStage]


class CooAlert(ORMBase):
    severity: Literal["P1", "P2", "P3"]
    message: str
    age_hours: int
    source: Literal["warehouse", "demo"]


class CooAlertsResponse(ORMBase):
    generated_at: str
    window_label: str
    alerts: list[CooAlert]


# ── Dynamic page banners (LLM-generated hero subtitles) ────────────────────


class BannerStat(ORMBase):
    """One data point that the banner prose cites — shown as a chip under the subtitle."""

    label: str
    value: str
    tone: Literal["positive", "negative", "neutral"] = "neutral"


# ── Coalition Flow (Earn → Redeem Sankey) ────────────────────────────────

SankeySide = Literal["earn", "redeem"]


class SankeyNode(ORMBase):
    id: str
    name: str
    side: SankeySide


class SankeyLink(ORMBase):
    source: str
    target: str
    value_aed: float


class CoalitionFlowResponse(ORMBase):
    nodes: list[SankeyNode]
    links: list[SankeyLink]
    total_aed: float
    earn_partner_count: int
    redeem_partner_count: int


# ── IFRS 15 Liability Aging Waterfall ───────────────────────────────────


IfrsAgeBucket = Literal["0-6m", "6-12m", "12-18m", "18-24m"]


class IfrsAgingBucket(ORMBase):
    age_bucket: IfrsAgeBucket
    liability_aed: float
    expected_breakage_aed: float
    expected_redemption_aed: float
    uncommitted_aed: float
    breakage_lo_aed: float
    breakage_hi_aed: float


class IfrsExpiring90d(ORMBase):
    member_count: int
    liability_aed: float
    sample_csv_url: str


class IfrsAgingResponse(ORMBase):
    buckets: list[IfrsAgingBucket]
    expiring_90d: IfrsExpiring90d
    total_liability_aed: float
    breakage_mean: float
    breakage_stdev: float


class BannerResponse(ORMBase):
    """Dynamic hero banner — subtitle prose + tone + numerics extracted from live data.

    Every analytical page has its own generator (see `services.banners`). The
    subtitle is filled with live metrics from the current window; when the Claude
    CLI is reachable and enabled, it also gets rewritten in the page's voice.
    """

    page: str
    generated_at: str
    window_label: str
    headline: str
    subtitle: str
    tone: Literal["positive", "negative", "neutral"] = "neutral"
    stats: list[BannerStat] = Field(default_factory=list)
    source: Literal["template", "claude", "fallback"] = "template"
