// Shared response types — mirror the FastAPI Pydantic schemas
// Generated manually for now; a future phase can codegen from OpenAPI.

export type Tier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
export type InsightPriority = 'info' | 'opportunity' | 'warning' | 'critical';
export type DeltaDirection = 'up' | 'down' | 'flat';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface SparkPoint {
  x: string;
  y: number;
}

export interface KpiTile {
  id: string;
  label: string;
  value: number;
  value_display: string;
  delta_pct: number | null;
  delta_direction: DeltaDirection;
  trend: SparkPoint[];
  sentiment: Sentiment;
}

export interface KpiResponse {
  period_label: string;
  generated_at: string;
  tiles: KpiTile[];
}

export interface TrendPoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface TrendResponse {
  series: TrendPoint[];
}

export interface CategoryMixItem {
  category: string;
  revenue: number;
  share_pct: number;
}

export interface StorePerfItem {
  store: string;
  revenue: number;
  transactions: number;
  avg_basket: number;
}

export interface TierDistItem {
  tier: Tier;
  members: number;
  revenue: number;
  share_pct: number;
}

export interface TopProductItem {
  sku_id: string;
  product_name: string;
  brand: string;
  category: string;
  revenue: number;
  units: number;
}

export interface Insight {
  id: string;
  title: string;
  text: string;
  priority: InsightPriority;
  icon: string;
  action?: string | null;
  evidence_chart_id?: string | null;
}

export interface InsightBundle {
  page: string;
  generated_at: string;
  question: string;
  insights: Insight[];
}

export interface MarketBasketRule {
  antecedents: string[];
  consequents: string[];
  antecedents_label: string;
  consequents_label: string;
  support: number;
  confidence: number;
  lift: number;
}

export interface BundleRecommendation {
  anchor: string;
  companion: string;
  lift: number;
  confidence: number;
  support: number;
  campaign_brief: string | null;
}

export interface RfmSegment {
  customer_id: string;
  recency: number;
  frequency: number;
  monetary: number;
  rfm_score: string;
  segment: string;
  predicted_cluster: number;
}

export interface RfmSummary {
  segments: RfmSegment[];
  silhouette_score: number;
  persona_counts: Record<string, number>;
}

export interface TierMigrationLink {
  source_tier: Tier;
  target_tier: Tier;
  members: number;
}

export interface TierMigrationHeadline {
  text: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export type FraudKind =
  | 'velocity'
  | 'bulk_redeem'
  | 'tier_farming'
  | 'partner_collision'
  | 'redeem_abuse';
export type FraudSeverity = 'low' | 'medium' | 'high';

export interface FraudFlag {
  id: string;
  member: string;
  kind: FraudKind;
  severity: FraudSeverity;
  score: number;
  explanation: string;
  loss_aed: number;
  detected_on: string;
}

export interface FraudSummary {
  window_label: string;
  total_flags: number;
  high_severity: number;
  medium_severity: number;
  low_severity: number;
  exposure_aed: number;
  kind_breakdown: Record<string, number>;
  flags: FraudFlag[];
  headline: { text: string; tone: 'positive' | 'negative' | 'neutral' };
}

export interface ForecastPoint {
  month: string;
  iso_date: string;
  revenue_actual: number | null;
  revenue_forecast: number;
  revenue_lo: number;
  revenue_hi: number;
  liability_forecast: number;
  ramadan: boolean;
}

export interface ForecastResponse {
  actuals_total_aed: number;
  next_6mo_aed: number;
  peak_month: string;
  peak_value_aed: number;
  liability_peak_aed: number;
  series: ForecastPoint[];
  headline: { text: string; tone: 'positive' | 'negative' | 'neutral' };
  model_engine: string;
}

export interface TierMigrationResponse {
  period_a_label: string;
  period_b_label: string;
  period_a_start: string;
  period_a_end: string;
  period_b_start: string;
  period_b_end: string;
  matrix: TierMigrationLink[];
  total_tracked: number;
  up_migrators: number;
  down_migrators: number;
  static_members: number;
  up_pct: number;
  down_pct: number;
  biggest_drop_route: string | null;
  biggest_drop_members: number;
  biggest_lift_route: string | null;
  biggest_lift_members: number;
  headline: TierMigrationHeadline;
}

export interface ChurnScore {
  customer_id: string;
  churn_probability: number;
  risk_band: 'High' | 'Medium' | 'Low';
  top_features: Array<{ feature: string; importance: number }>;
}

export interface ChurnMetrics {
  auc_roc: number;
  precision: number;
  recall: number;
  churn_rate: number;
}

export interface ChurnResponse {
  metrics: ChurnMetrics;
  high_risk_sample: ChurnScore[];
}

export interface ClvPrediction {
  customer_id: string;
  predicted_clv_12m: number;
  retention_probability: number;
  clv_tier: 'Premium' | 'High' | 'Medium' | 'Low';
}

export interface ClvResponse {
  predictions: ClvPrediction[];
  summary: Record<string, number>;
}

export interface ActNowCustomer {
  customer_id: string;
  name: string;
  tier: Tier;
  churn_probability: number;
  predicted_clv_12m: number;
  urgency_score: number;
  suggested_action: string;
}

export interface Recommendation {
  sku_id: string;
  product_name: string;
  score: number;
  reason: string;
}

export interface RecommendationBundle {
  customer_id: string;
  generated_at: string;
  recommendations: Recommendation[];
}

export interface ChatAuditTrail {
  retrieved_tables: string[];
  executed_sql: string | null;
  row_count: number | null;
}

export interface ChatResponse {
  question: string;
  answer: string;
  audit: ChatAuditTrail;
  follow_ups: string[];
}

export interface NextBestAction {
  customer_id: string;
  action: string;
  rationale: string;
  expected_uplift_aed: number;
}

export interface CohortCell {
  cohort_month: string;
  month_offset: number;
  active_rate: number;
  active_count: number;
  cohort_size: number;
}

export interface AnomalyPoint {
  date: string;
  revenue: number;
  expected: number;
  residual: number;
  is_anomaly: boolean;
  reason: string | null;
}

// ── Anomaly-Explain agent ─────────────────────────────────────
export type AnomalyMetric = 'revenue' | 'members' | 'redemptions';
export type AnomalyDimension = 'partner' | 'store' | 'region';
export type AgentConfidence = 'high' | 'medium' | 'low';

export interface AnomalyExplainRequest {
  date: string;
  metric: AnomalyMetric;
  deviation_pct: number;
}

export interface AnomalySuspect {
  dimension: AnomalyDimension;
  value: string;
  contribution_aed: number;
  contribution_pct: number;
}

export interface AnomalyExplainResponse {
  date: string;
  metric: AnomalyMetric;
  summary: string;
  root_cause: string;
  suspect_dimensions: AnomalySuspect[];
  sql_used: string;
  confidence: AgentConfidence;
  abstained: boolean;
}

// ── Save-Loop agent ───────────────────────────────────────────
export type SaveLoopChannel = 'whatsapp' | 'email' | 'push';

export interface SaveLoopRequest {
  command: string;
}

export interface SaveLoopSegment {
  sql: string;
  member_count: number;
  avg_spend_aed: number;
}

export interface SaveLoopOffer {
  en: string;
  ar: string;
  bonus_aed: number;
  channel: SaveLoopChannel;
}

export interface SaveLoopPlan {
  treated_count: number;
  holdout_count: number;
  expected_lift_aed: number;
  expected_lift_pct: number;
  confidence: AgentConfidence;
}

export interface SaveLoopTraceStep {
  step: string;
  tool: string;
  output: string;
}

export interface SaveLoopResponse {
  command: string;
  segment: SaveLoopSegment;
  offer: SaveLoopOffer;
  plan: SaveLoopPlan;
  trace: SaveLoopTraceStep[];
  abstained: boolean;
}

// ── Fraud Graph agent ─────────────────────────────────────────
export type FraudGraphPattern = 'point-laundering' | 'device-sharing' | 'velocity-ring';

export interface FraudRingMember {
  member_id: string;
  masked_name: string;
  degree: number;
}

export interface FraudRingMerchant {
  merchant: string;
  txn_count: number;
}

export interface FraudRing {
  ring_id: string;
  members: FraudRingMember[];
  merchants: FraudRingMerchant[];
  pattern: FraudGraphPattern;
  risk_score: number;
  community_pagerank: number;
  first_seen: string;
  total_txn_aed: number;
}

export interface FraudGraphStats {
  n_nodes: number;
  n_edges: number;
  n_communities: number;
  modularity: number;
}

export interface FraudGraphResponse {
  date_from: string;
  date_to: string;
  min_ring_size: number;
  rings: FraudRing[];
  graph_stats: FraudGraphStats;
}

export interface FraudGraphFilters {
  date_from?: string;
  date_to?: string;
  min_ring_size?: number;
}

export interface FiltersState {
  store?: string;
  category?: string;
  tier?: Tier;
  date_from?: string;
  date_to?: string;
}

// ── COO (Coalition Operations) ───────────────────────────────────

export type CooMetricSource = 'warehouse' | 'demo' | 'runtime';

export interface CooMetric {
  key: string;
  label: string;
  value: number;
  value_display: string;
  caption: string | null;
  source: CooMetricSource;
}

export interface CooSystemHealth {
  generated_at: string;
  window_label: string;
  metrics: CooMetric[];
}

export interface CooPartner {
  name: string;
  earn_index: number;
  redemption_index: number;
  sla_pct: number;
  health: 'green' | 'amber' | 'red';
  txns_window: number;
  earn_delta_wow_pct: number | null;
}

export interface CooPartnersResponse {
  generated_at: string;
  window_label: string;
  partners: CooPartner[];
  hhi: number;
}

export interface CooFunnelStage {
  stage: string;
  count: number;
  rate_pct: number;
  target_pct: number;
  median_days: number | null;
}

export interface CooLifecycleFunnel {
  generated_at: string;
  window_label: string;
  stages: CooFunnelStage[];
}

export interface CooAlert {
  severity: 'P1' | 'P2' | 'P3';
  message: string;
  age_hours: number;
  source: CooMetricSource;
}

export interface CooAlertsResponse {
  generated_at: string;
  window_label: string;
  alerts: CooAlert[];
}

// ── Coalition Flow (Earn → Redeem Sankey) ──────────────────
export type SankeySide = 'earn' | 'redeem';

export interface SankeyNode {
  id: string;
  name: string;
  side: SankeySide;
}

export interface SankeyLink {
  source: string;
  target: string;
  value_aed: number;
}

export interface CoalitionFlowResponse {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total_aed: number;
  earn_partner_count: number;
  redeem_partner_count: number;
}

// ── IFRS 15 Liability Aging ──────────────────────────────────
export type IfrsAgeBucket = '0-6m' | '6-12m' | '12-18m' | '18-24m';

export interface IfrsAgingBucket {
  age_bucket: IfrsAgeBucket;
  liability_aed: number;
  expected_breakage_aed: number;
  expected_redemption_aed: number;
  uncommitted_aed: number;
  breakage_lo_aed: number;
  breakage_hi_aed: number;
}

export interface IfrsExpiring90d {
  member_count: number;
  liability_aed: number;
  sample_csv_url: string;
}

export interface IfrsAgingResponse {
  buckets: IfrsAgingBucket[];
  expiring_90d: IfrsExpiring90d;
  total_liability_aed: number;
  breakage_mean: number;
  breakage_stdev: number;
}

// ── Dynamic page banners (LLM-generated hero subtitles) ──
export type BannerTone = 'positive' | 'negative' | 'neutral';
export type BannerSource = 'template' | 'claude' | 'fallback';

export interface BannerStat {
  label: string;
  value: string;
  tone: BannerTone;
}

export interface BannerResponse {
  page: string;
  generated_at: string;
  window_label: string;
  headline: string;
  subtitle: string;
  tone: BannerTone;
  stats: BannerStat[];
  source: BannerSource;
}

// ── Creative Agent (Ramadan-aware Arabic generator) ───────────
export type CreativeSegment =
  | 'hibernating_whales'
  | 'gold_tier_moms'
  | 'silver_dads'
  | 'lapsed_f&b'
  | 'ramadan_shoppers';
export type CreativeOccasion =
  | 'ramadan'
  | 'eid_al_fitr'
  | 'eid_al_adha'
  | 'national_day'
  | 'generic';
export type CreativeChannel = 'push' | 'whatsapp' | 'banner' | 'email';
export type CreativeLang = 'ar' | 'en' | 'both';

export interface CreativeRequest {
  segment: CreativeSegment;
  occasion: CreativeOccasion;
  channel: CreativeChannel;
  lang: CreativeLang;
}

export interface CreativeAsset {
  channel: CreativeChannel;
  lang: 'ar' | 'en';
  copy_headline: string;
  copy_body: string;
  cta: string;
  imagery_prompt: string;
  persado_variants: string[];
  brand_guardrail_passed: boolean;
}

export interface HijriContext {
  date: string;
  moon_day: number;
  is_last_10_nights: boolean;
  notes?: string | null;
}

export interface ComplianceContext {
  pdpl_safe: boolean;
  notes: string;
}

export interface CreativeResponse {
  assets: CreativeAsset[];
  hijri_context: HijriContext;
  compliance: ComplianceContext;
  generation_time_ms: number;
  model: string;
  source: 'claude' | 'fallback';
}

// ── Receipt OCR (off-SKU earning) ──────────────────────────────
export interface ReceiptLineItem {
  sku: string;
  description: string;
  qty: number;
  unit_price_aed: number;
  line_aed: number;
  category: string;
}

export interface ReceiptScanRequest {
  image_base64: string;
  member_id: string;
}

export interface ReceiptScanResponse {
  receipt_id: string;
  merchant: string;
  merchant_is_partner: boolean;
  txn_date: string;
  total_aed: number;
  line_items: ReceiptLineItem[];
  points_awarded: number;
  points_rule_applied: string;
  confidence: 'high' | 'medium' | 'low';
  processing_time_ms: number;
  flags: string[];
}

// ── Elasticity what-if simulator ───────────────────────────────
export interface ElasticitySimulateRequest {
  redemption_rate_nexus_per_aed: number;
  earn_rate_nexus_per_aed: number;
  threshold_promo_nexus?: number | null;
  horizon_days: number;
}

export interface ElasticityScenarioState {
  revenue_aed: number;
  liability_aed: number;
  breakage_aed: number;
  active_members: number;
  elasticity?: number | null;
}

export interface ElasticityDelta {
  revenue_aed: number;
  revenue_pct: number;
  liability_aed: number;
  liability_pct: number;
  active_members: number;
  active_members_pct: number;
}

export interface ElasticityMonteCarlo {
  revenue_p10: number;
  revenue_p50: number;
  revenue_p90: number;
  liability_p10: number;
  liability_p50: number;
  liability_p90: number;
}

export interface ElasticityCurvePoint {
  redemption_rate: number;
  revenue_aed: number;
  liability_aed: number;
}

export interface ElasticitySimulateResponse {
  baseline: ElasticityScenarioState;
  scenario: ElasticityScenarioState;
  delta: ElasticityDelta;
  monte_carlo: ElasticityMonteCarlo;
  curve: ElasticityCurvePoint[];
  model: 'log-log';
  horizon_days: number;
  assumptions: Record<string, number>;
}
