/**
 * Demo-grade synthetic data for pages whose backend endpoints don't exist yet.
 * Interview-ready, numerically consistent with Nexus's public positioning
 * (1.2M members · 55 Acme Retail stores · 1:1 earn · 200:1 redeem · 26% breakage · 24-mo expiry).
 * Production swap: replace each module with a live API call.
 */

// ── PDPL / Compliance ────────────────────────────────────────────
export const PDPL_DEMO = {
  enforcementDate: '2027-01-01',
  daysUntilEnforcement: (() => {
    const now = Date.now();
    const enforce = Date.UTC(2027, 0, 1);
    return Math.max(0, Math.round((enforce - now) / 86_400_000));
  })(),
  consentRate: 0.942, // 94.2% members have active PDPL consent
  consentRateDelta: 0.018,
  dsrQueue: {
    open: 12,
    in_progress: 4,
    closed_30d: 47,
    sla_at_risk: 1,
    avg_close_hours: 38,
  },
  breachLog: [
    {
      id: 'B-2026-04-02',
      date: '2026-04-02',
      severity: 'Low' as const,
      description: 'Mis-routed DSR email exposed member name only (no PII).',
      status: 'Closed',
    },
    {
      id: 'B-2026-02-14',
      date: '2026-02-14',
      severity: 'Medium' as const,
      description: 'Partner API returned 412 full records to unauthorised tenant; contained in 11 min.',
      status: 'Closed',
    },
  ],
  residency: [
    { region: 'UAE (primary)', records: '1.18M', host: 'AWS me-central-1 (Dubai)' },
    { region: 'Bahrain (replica)', records: '92K', host: 'AWS me-south-1 (Bahrain)' },
  ],
  dpiaCoverage: 0.87, // 87% of processing activities have DPIA completed
  subprocessors: [
    { name: 'Twilio (OTP)', jurisdiction: 'US', dpa: 'Signed 2025-08-12' },
    { name: 'SendGrid (email)', jurisdiction: 'US', dpa: 'Signed 2025-08-12' },
    { name: 'AWS (hosting)', jurisdiction: 'AE', dpa: 'Signed 2024-11-03' },
    { name: 'Datadog (logs)', jurisdiction: 'US/EU', dpa: 'Signed 2025-06-01' },
  ],
} as const;

// ── App Health + Support ─────────────────────────────────────────
export const APP_HEALTH_DEMO = {
  crashFreeRate: 0.987,
  crashFreeTarget: 0.995,
  otpDeliverySuccess: 0.962,
  otpDeliveryTarget: 0.98,
  appRatingIos: 3.2, // public App Store rating — known Nexus pain
  appRatingAndroid: 3.4,
  appRatingTrend: [3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.2] as number[], // last 7 weeks
  activeIncidents: 1,
  p0Tickets24h: 0,
  p1Tickets24h: 3,
  p2Tickets7d: 41,
  mttrHours: 4.7,
  ticketBacklog: 187,
  ticketBacklogTrend: [142, 158, 163, 170, 181, 192, 187] as number[],
  reopenRate: 0.13,
  topComplaints: [
    { reason: 'Points not credited after transaction', count: 48, share: 0.26 },
    { reason: 'App login / OTP failure', count: 37, share: 0.20 },
    { reason: 'Redemption failed at POS', count: 29, share: 0.16 },
    { reason: 'Wrong tier / wrong points balance', count: 21, share: 0.11 },
    { reason: 'Unable to delete account', count: 14, share: 0.07 },
  ],
  posOutages7d: 2,
  posUptime: 0.9988,
} as const;

// ── Revenue + Liability Forecast (13 months) ─────────────────────
export type ForecastPoint = {
  month: string;
  revenue_actual?: number;
  revenue_forecast: number;
  revenue_lo: number;
  revenue_hi: number;
  liability_forecast: number;
  ramadan?: boolean;
  eid?: boolean;
};

export const FORECAST_DEMO: ForecastPoint[] = (() => {
  const base = 4_800_000; // AED
  const growth = 0.023; // 2.3% m/m
  const months = [
    '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
  ];
  const ramadanMonths = new Set(['2026-02', '2026-03']); // approx Ramadan window 2026
  const eidMonths = new Set(['2026-03', '2026-04', '2026-06']); // Eid al-Fitr + Adha

  return months.map((m, i) => {
    const seasonality = ramadanMonths.has(m) ? 1.34 : eidMonths.has(m) ? 1.12 : 1.0;
    const forecast = Math.round(base * Math.pow(1 + growth, i) * seasonality);
    const isActual = i < 6; // first 6 are "actual"
    return {
      month: m,
      revenue_actual: isActual ? forecast + Math.round((Math.random() - 0.5) * 200_000) : undefined,
      revenue_forecast: forecast,
      revenue_lo: Math.round(forecast * 0.91),
      revenue_hi: Math.round(forecast * 1.09),
      liability_forecast: Math.round(forecast * 0.74 * 0.26 / 200), // AED liability from breakage
      ramadan: ramadanMonths.has(m),
      eid: eidMonths.has(m),
    };
  });
})();

// ── Coalition Flow (Earn → Redeem) — Sankey data ────────────────
export type SankeyFlow = {
  source: string;
  target: string;
  value: number; // Nexus points (not AED)
};

export const COALITION_FLOW_DEMO: SankeyFlow[] = [
  // earn categories → redemption categories
  { source: 'Fresh Food', target: 'Fresh Food', value: 2_400_000 },
  { source: 'Fresh Food', target: 'Beverages', value: 680_000 },
  { source: 'Fresh Food', target: 'Household', value: 320_000 },
  { source: 'Fresh Food', target: 'Personal Care', value: 180_000 },
  { source: 'Fresh Food', target: 'Jewellery', value: 95_000 },

  { source: 'Beverages', target: 'Beverages', value: 840_000 },
  { source: 'Beverages', target: 'Fresh Food', value: 460_000 },
  { source: 'Beverages', target: 'Household', value: 210_000 },

  { source: 'Household', target: 'Household', value: 520_000 },
  { source: 'Household', target: 'Fresh Food', value: 380_000 },
  { source: 'Household', target: 'Personal Care', value: 140_000 },

  { source: 'Personal Care', target: 'Personal Care', value: 410_000 },
  { source: 'Personal Care', target: 'Fresh Food', value: 220_000 },
  { source: 'Personal Care', target: 'Beverages', value: 110_000 },

  { source: 'Jewellery', target: 'Fresh Food', value: 280_000 },
  { source: 'Jewellery', target: 'Personal Care', value: 140_000 },
  { source: 'Jewellery', target: 'Jewellery', value: 92_000 },
];

// Time-to-burn cohort — median days from earn to redeem, per tier
export const TIME_TO_BURN_DEMO = [
  { tier: 'Platinum', medianDays: 34, p25: 14, p75: 68, sample: 18_200 },
  { tier: 'Gold', medianDays: 58, p25: 22, p75: 112, sample: 142_800 },
  { tier: 'Silver', medianDays: 94, p25: 38, p75: 178, sample: 392_400 },
  { tier: 'Bronze', medianDays: 142, p25: 56, p75: 261, sample: 688_100 },
] as const;

// ── Devaluation recovery (post-Dec-2024) ─────────────────────────
export const DEVALUATION_DEMO = {
  event: { date: '2024-12-15', description: 'Nexus ratio devalued 400:1 → 200:1 (2× value)' },
  redemptionVelocity: [
    { month: '2024-09', nexus_burned_m: 4.2 },
    { month: '2024-10', nexus_burned_m: 4.5 },
    { month: '2024-11', nexus_burned_m: 4.1 },
    { month: '2024-12', nexus_burned_m: 7.8 }, // devaluation panic burn
    { month: '2025-01', nexus_burned_m: 3.2 },
    { month: '2025-02', nexus_burned_m: 2.4 },
    { month: '2025-03', nexus_burned_m: 2.8 },
    { month: '2025-04', nexus_burned_m: 3.1 },
    { month: '2025-05', nexus_burned_m: 3.6 },
    { month: '2025-06', nexus_burned_m: 3.9 },
    { month: '2025-07', nexus_burned_m: 4.2 },
    { month: '2025-08', nexus_burned_m: 4.5 },
    { month: '2025-09', nexus_burned_m: 4.8 },
    { month: '2025-10', nexus_burned_m: 5.1 },
  ],
  appDau7dRollingPct: [
    { month: '2024-09', pct: 0.38 },
    { month: '2024-10', pct: 0.37 },
    { month: '2024-11', pct: 0.36 },
    { month: '2024-12', pct: 0.31 }, // drop after devaluation
    { month: '2025-01', pct: 0.27 },
    { month: '2025-02', pct: 0.26 },
    { month: '2025-03', pct: 0.29 },
    { month: '2025-04', pct: 0.31 },
    { month: '2025-05', pct: 0.33 },
    { month: '2025-06', pct: 0.34 },
    { month: '2025-07', pct: 0.35 },
    { month: '2025-08', pct: 0.36 },
    { month: '2025-09', pct: 0.37 },
    { month: '2025-10', pct: 0.38 },
  ],
  complaintVolume: [
    { month: '2024-09', tickets: 420 },
    { month: '2024-10', tickets: 445 },
    { month: '2024-11', tickets: 480 },
    { month: '2024-12', tickets: 1_240 }, // complaint spike
    { month: '2025-01', tickets: 920 },
    { month: '2025-02', tickets: 680 },
    { month: '2025-03', tickets: 540 },
    { month: '2025-04', tickets: 470 },
    { month: '2025-05', tickets: 430 },
    { month: '2025-06', tickets: 410 },
    { month: '2025-07', tickets: 395 },
    { month: '2025-08', tickets: 380 },
    { month: '2025-09', tickets: 365 },
    { month: '2025-10', tickets: 340 },
  ],
} as const;

// ── Bahrain vs UAE split ─────────────────────────────────────────
export const REGION_SPLIT_DEMO = {
  uae: {
    members: 1_180_000,
    revenue_last_30d: 5_280_000,
    active_rate: 0.34,
    stores: 55,
    launched: '2016',
  },
  bahrain: {
    members: 92_000,
    revenue_last_30d: 380_000,
    active_rate: 0.41, // higher — new-customer honeymoon
    stores: 6,
    launched: '2025-11',
  },
  comparison: {
    day_30_activation_bahrain: 0.62,
    day_30_activation_uae_avg: 0.45,
    takeaway: 'Bahrain week-1 cohort shows +38% higher day-30 active rate — export the playbook.',
  },
} as const;

// ── UAE Emirates (for geo-map) ──────────────────────────────────
export type Emirate = {
  id: string;
  name: string;
  x: number; // 0-100 relative
  y: number;
  revenue: number; // AED
  stores: number;
};

export const UAE_EMIRATES: Emirate[] = [
  { id: 'dubai', name: 'Dubai', x: 32, y: 60, revenue: 3_420_000, stores: 24 },
  { id: 'abu-dhabi', name: 'Abu Dhabi', x: 18, y: 72, revenue: 1_240_000, stores: 12 },
  { id: 'sharjah', name: 'Sharjah', x: 42, y: 50, revenue: 410_000, stores: 8 },
  { id: 'ajman', name: 'Ajman', x: 48, y: 44, revenue: 98_000, stores: 3 },
  { id: 'umm-al-quwain', name: 'Umm Al Quwain', x: 55, y: 38, revenue: 42_000, stores: 2 },
  { id: 'ras-al-khaimah', name: 'Ras Al Khaimah', x: 62, y: 28, revenue: 54_000, stores: 3 },
  { id: 'fujairah', name: 'Fujairah', x: 78, y: 42, revenue: 62_000, stores: 3 },
];

// ── ML Model Cards ───────────────────────────────────────────────
export const MODEL_CARDS = [
  {
    id: 'churn-xgb',
    name: 'Churn Prediction',
    algorithm: 'XGBoost (gbtree)',
    owner: 'Predictive Analytics',
    trainedOn: '2026-03-28',
    trainingRows: 1_180_000,
    holdoutRows: 236_000,
    metrics: { auc_roc: 0.842, precision_at_10: 0.71, recall_at_10: 0.58, f1: 0.64 },
    aucHistory: [0.811, 0.823, 0.831, 0.838, 0.842], // last 5 retrains
    driftStatus: 'green' as const,
    driftNote: 'PSI 0.08 on monthly validation. Stable.',
    features: ['recency_days', 'frequency_90d', 'monetary_180d', 'tier', 'app_dau_30d', 'points_balance', 'redeem_ratio', 'cross_partner_visits', 'last_tier_change_days', 'ramadan_flag'],
  },
  {
    id: 'clv-bgnbd',
    name: '12-Month CLV',
    algorithm: 'BG/NBD + Gamma-Gamma',
    owner: 'Predictive Analytics',
    trainedOn: '2026-03-28',
    trainingRows: 1_180_000,
    holdoutRows: 236_000,
    metrics: { mape: 0.182, mae_aed: 41.2, rmse_aed: 112.7, calibration: 0.91 },
    aucHistory: [0.88, 0.89, 0.90, 0.91, 0.91],
    driftStatus: 'green' as const,
    driftNote: 'Gamma-Gamma assumption holds (corr 0.04 between freq and monetary).',
    features: ['recency', 'frequency', 'monetary', 'T (observation window)'],
  },
  {
    id: 'rfm-kmeans',
    name: 'RFM Segmentation',
    algorithm: 'KMeans (k=8)',
    owner: 'Customer Analytics',
    trainedOn: '2026-04-04',
    trainingRows: 1_180_000,
    holdoutRows: 0,
    metrics: { silhouette: 0.61, davies_bouldin: 0.72, inertia: 4_820_000 },
    aucHistory: [0.52, 0.55, 0.58, 0.60, 0.61],
    driftStatus: 'yellow' as const,
    driftNote: 'Cluster 3 ("Hibernating Whales") drifting toward cluster 5 boundary — review post-Ramadan.',
    features: ['recency_z', 'frequency_z', 'monetary_z'],
  },
  {
    id: 'basket-fpgrowth',
    name: 'Market Basket (FP-Growth)',
    algorithm: 'FP-Growth',
    owner: 'Merchandising',
    trainedOn: '2026-04-10',
    trainingRows: 8_420_000, // transaction lines
    holdoutRows: 0,
    metrics: { min_support: 0.02, min_confidence: 0.30, rules: 217 },
    aucHistory: [195, 203, 210, 214, 217], // rule count growth
    driftStatus: 'green' as const,
    driftNote: 'Support distribution stable across weekly runs.',
    features: ['basket transaction lines (implicit)'],
  },
] as const;

// ── Proactive AI alerts feed ─────────────────────────────────────
export type AiAlert = {
  id: string;
  timestamp: string; // ISO
  severity: 'info' | 'opportunity' | 'warning' | 'critical';
  title: string;
  narrative: string;
  evidence: string; // short data citation
  action?: string;
  source: string; // which model / pipeline
  acknowledged?: boolean;
};

export const AI_ALERTS_DEMO: AiAlert[] = [
  {
    id: 'A-2026-04-18-0712',
    timestamp: '2026-04-18T07:12:00Z',
    severity: 'critical',
    title: 'Breakage jumped 3.2 pp overnight — Bronze tier',
    narrative:
      'Bronze-tier breakage rose from 27.8% to 31.0% (3.2 pp) between 2026-04-17 close and 2026-04-18 open. Likely cause: 2024-11 signup cohort hitting 17-month expiry window.',
    evidence: 'points_liability_daily.breakage_rate · Bronze tier · 3.2 pp',
    action: 'Trigger a pre-expiry redemption reminder campaign targeting 24,200 Bronze members.',
    source: 'Anomaly engine · STL residual + breakage monitor',
  },
  {
    id: 'A-2026-04-18-0304',
    timestamp: '2026-04-18T03:04:00Z',
    severity: 'opportunity',
    title: 'Acme Retail Marina basket size 1.9× JBR on identical footfall',
    narrative:
      'Marina achieved AED 284 avg basket vs JBR AED 149 over last 7d at identical transaction volume. Assortment or planogram difference worth replicating.',
    evidence: 'store_performance.avg_basket · window 7d · store_id=103 vs 107',
    action: 'Brief merchandising on Marina planogram. Potential uplift AED 62K/week if JBR matches.',
    source: 'Store performance delta scan',
  },
  {
    id: 'A-2026-04-17-1745',
    timestamp: '2026-04-17T17:45:00Z',
    severity: 'warning',
    title: 'OTP delivery dropped 2.8 pp after 17:00 GST',
    narrative:
      'Twilio ME region success rate fell from 96.4% to 93.6% post-17:00 on 2026-04-17. 412 members affected. Not yet at P1 severity but worth operator attention.',
    evidence: 'app_health.otp_success · window last 3h · Twilio ME',
    action: 'Ops — confirm Twilio status page + prep SMS fallback via Unifonic if sustains.',
    source: 'App-health monitor',
  },
  {
    id: 'A-2026-04-17-1030',
    timestamp: '2026-04-17T10:30:00Z',
    severity: 'opportunity',
    title: 'Ramadan week -2 earn rate up 18% YoY',
    narrative:
      'Daily earn rate trailing 14-day average is 2.1× vs baseline, same seasonality shape as 2025 but with 18% higher absolute volume. Ramadan pre-stock incoming.',
    evidence: 'daily_earn.points_issued · window 14d · seasonality model',
    action: 'Staff +15% capacity for weeks -1 and 0 at top-20 stores.',
    source: 'Seasonality forecaster',
  },
  {
    id: 'A-2026-04-17-0815',
    timestamp: '2026-04-17T08:15:00Z',
    severity: 'info',
    title: 'Churn model retrained — AUC 0.842 (+0.004)',
    narrative:
      'Weekly XGBoost retrain completed with holdout AUC 0.842, up 0.004 from last week. No drift alerts. Scoring for next 7d uses this model.',
    evidence: 'models.churn_xgb.version=2026-w16 · AUC 0.842',
    source: 'ML pipeline',
    acknowledged: true,
  },
  {
    id: 'A-2026-04-17-0040',
    timestamp: '2026-04-17T00:40:00Z',
    severity: 'warning',
    title: '3 POS terminals offline > 15 min in Sharjah City Centre',
    narrative:
      '3 of 7 terminals at Sharjah City Centre went offline between 00:25 and 00:40 GST. Transactions routing to standby. Estimated AED 18K revenue at risk if outage extends beyond 1h.',
    evidence: 'pos_status.offline · store=SCC · 3/7 terminals',
    action: 'Ops — verify network link; fallback to hand-scan redemption if sustained.',
    source: 'POS heartbeat monitor',
    acknowledged: true,
  },
];

// ── Data catalog / semantic layer ────────────────────────────────
export type MetricDef = {
  id: string;
  name: string;
  short: string;
  definition: string;
  unit: string;
  sql: string;
  pipeline: string;
  owner: string;
  uses_in: string[];
};

export const METRIC_CATALOG: MetricDef[] = [
  {
    id: 'atv',
    name: 'Average Transaction Value',
    short: 'ATV',
    definition: 'Total revenue divided by transaction count in the window.',
    unit: 'AED',
    sql: 'SUM(revenue) / COUNT(DISTINCT txn_id)',
    pipeline: 'fact_transactions · daily refresh',
    owner: 'Finance Analytics',
    uses_in: ['/executive', '/stores', '/loyalty'],
  },
  {
    id: 'ams',
    name: 'Average Monthly Spend',
    short: 'AMS',
    definition: 'Rolling 30-day member spend divided by active member count.',
    unit: 'AED / member / month',
    sql: 'SUM(revenue_30d) / COUNT(DISTINCT active_member_id)',
    pipeline: 'fact_members_monthly · rolling 30d',
    owner: 'Customer Analytics',
    uses_in: ['/', '/loyalty', '/segments'],
  },
  {
    id: 'mau',
    name: 'Monthly Active Users',
    short: 'MAU',
    definition: 'Members with ≥1 transaction in the rolling 30-day window.',
    unit: 'count',
    sql: "COUNT(DISTINCT member_id) WHERE last_txn_ts > NOW() - INTERVAL 30 DAY",
    pipeline: 'fact_transactions + dim_members',
    owner: 'Customer Analytics',
    uses_in: ['/', '/executive', '/predictive'],
  },
  {
    id: 'hhi',
    name: 'Herfindahl-Hirschman Index',
    short: 'HHI',
    definition: 'Market concentration. Sum of squared market-share percentages across coalition partners. <1500 diverse, 1500-2500 moderate, >2500 concentrated.',
    unit: 'index',
    sql: 'SUM(POWER(partner_share * 100, 2))',
    pipeline: 'partner_revenue_monthly',
    owner: 'Governance',
    uses_in: ['/stores', '/executive (CEO lens)'],
  },
  {
    id: 'clv',
    name: 'Customer Lifetime Value (12-month)',
    short: 'CLV',
    definition: '12-month projected spend per member. BG/NBD transactions × Gamma-Gamma monetary.',
    unit: 'AED',
    sql: 'bgnbd_proba × gamma_gamma_monetary_mean',
    pipeline: 'ml_pipeline.clv_monthly',
    owner: 'Predictive Analytics',
    uses_in: ['/predictive', '/segments'],
  },
  {
    id: 'breakage',
    name: 'Breakage rate',
    short: 'Breakage',
    definition: 'Share of Nexus points issued that will never be redeemed (expire or abandoned). IFRS 15 key input.',
    unit: '%',
    sql: '1 - (points_redeemed + points_outstanding_live) / points_issued_total',
    pipeline: 'points_liability_daily',
    owner: 'Finance Analytics',
    uses_in: ['/executive (CFO lens)', '/forecast', '/ifrs'],
  },
  {
    id: 'earn_burn',
    name: 'Earn/Burn ratio',
    short: 'E/B',
    definition: 'Points issued divided by points redeemed in window. >1.0 means liability growing; <1.0 means depletion.',
    unit: 'ratio',
    sql: 'points_issued / NULLIF(points_redeemed, 0)',
    pipeline: 'points_daily',
    owner: 'Finance Analytics',
    uses_in: ['/', '/executive', '/forecast'],
  },
  {
    id: 'rfm',
    name: 'RFM segment',
    short: 'RFM',
    definition: 'Recency / Frequency / Monetary quintile string, e.g. "551" = last-quintile recency, top-quintile frequency+monetary.',
    unit: 'string',
    sql: "CONCAT(NTILE(5) OVER (ORDER BY recency), NTILE(5) OVER (ORDER BY frequency), NTILE(5) OVER (ORDER BY monetary))",
    pipeline: 'ml_pipeline.rfm_monthly',
    owner: 'Customer Analytics',
    uses_in: ['/segments', '/recommendations', '/predictive'],
  },
  {
    id: 'time_to_burn',
    name: 'Time-to-burn (days)',
    short: 'T2B',
    definition: 'Median days from point earned to point redeemed, grouped by tier.',
    unit: 'days',
    sql: 'MEDIAN(redeem_ts - earn_ts) GROUP BY tier',
    pipeline: 'points_cohort_monthly',
    owner: 'Finance Analytics',
    uses_in: ['/coalition-flow', '/executive (CFO lens)'],
  },
  {
    id: 'points_liability_aed',
    name: 'Points liability (AED)',
    short: 'Liability',
    definition: 'Deferred revenue per IFRS 15 — outstanding Nexus × redeemable fraction / 200.',
    unit: 'AED',
    sql: '(points_outstanding × (1 - breakage)) / 200',
    pipeline: 'points_liability_daily',
    owner: 'Finance Analytics',
    uses_in: ['/executive (CFO lens)', '/forecast', '/ifrs'],
  },
];

// ── Audit log entries ────────────────────────────────────────────
export type AuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  resource: string;
  outcome: 'ok' | 'denied' | 'error';
  ip?: string;
};

export const AUDIT_LOG_DEMO: AuditEntry[] = [
  { id: 'AL-9182', ts: '2026-04-18T09:12:04Z', actor: 'mark.md@nexus.com', action: 'view', resource: '/executive (CEO lens)', outcome: 'ok', ip: '185.19.40.12' },
  { id: 'AL-9181', ts: '2026-04-18T08:55:31Z', actor: 'cfo@nexus.com', action: 'export_csv', resource: '/executive (CFO lens) — breakage_aging', outcome: 'ok' },
  { id: 'AL-9180', ts: '2026-04-18T08:40:18Z', actor: 'ai-agent.save-loop', action: 'segment_query', resource: '/save-loop · hibernating_whales', outcome: 'ok' },
  { id: 'AL-9179', ts: '2026-04-18T08:30:04Z', actor: 'acme-partner@acme.com', action: 'view', resource: '/stores (partner-scoped)', outcome: 'ok' },
  { id: 'AL-9178', ts: '2026-04-18T08:12:40Z', actor: 'analyst@nexus.com', action: 'chat_query', resource: "/chat — 'why is Bronze breakage climbing?'", outcome: 'ok' },
  { id: 'AL-9177', ts: '2026-04-18T07:55:00Z', actor: 'retrain-cron', action: 'model_retrain', resource: 'models.churn_xgb', outcome: 'ok' },
  { id: 'AL-9176', ts: '2026-04-18T07:30:22Z', actor: 'ops@nexus.com', action: 'acknowledge_alert', resource: 'A-2026-04-18-0040 (POS Sharjah)', outcome: 'ok' },
  { id: 'AL-9175', ts: '2026-04-17T22:04:55Z', actor: 'unknown', action: 'api_access', resource: '/api/v1/members/export', outcome: 'denied', ip: '92.215.4.18' },
  { id: 'AL-9174', ts: '2026-04-17T18:25:12Z', actor: 'mark.md@nexus.com', action: 'share_link', resource: '/predictive?tier=Platinum', outcome: 'ok' },
  { id: 'AL-9173', ts: '2026-04-17T16:10:48Z', actor: 'legal@nexus.com', action: 'view', resource: '/compliance · DSR queue', outcome: 'ok' },
  { id: 'AL-9172', ts: '2026-04-17T14:30:00Z', actor: 'dpo@nexus.com', action: 'dsr_close', resource: 'DSR-2026-0412 — erasure', outcome: 'ok' },
  { id: 'AL-9171', ts: '2026-04-17T12:00:04Z', actor: 'ai-agent.save-loop', action: 'offer_draft', resource: 'customer_id=C-91241', outcome: 'ok' },
];

// ── Peer benchmarks ──────────────────────────────────────────────
export type Benchmark = {
  metric: string;
  unit: string;
  nexus: number;
  peer_median: number;
  peer_p75: number;
  peer_p25: number;
  direction: 'higher_better' | 'lower_better';
  peers_n: number;
  note: string;
};

export const BENCHMARKS_DEMO: Benchmark[] = [
  { metric: 'Member base', unit: 'M', nexus: 1.2, peer_median: 0.8, peer_p25: 0.3, peer_p75: 2.1, direction: 'higher_better', peers_n: 11, note: 'MENA coalition sample (SHARE, ADCB, Lulu, Skywards-tier, Careem, etc).' },
  { metric: 'Active rate (30d)', unit: '%', nexus: 34, peer_median: 31, peer_p25: 24, peer_p75: 42, direction: 'higher_better', peers_n: 11, note: 'Above median but 8pp below top quartile.' },
  { metric: 'Avg transaction value', unit: 'AED', nexus: 164, peer_median: 127, peer_p25: 88, peer_p75: 212, direction: 'higher_better', peers_n: 11, note: 'Grocery coalition bias pulls basket higher than peers.' },
  { metric: 'Earn / Burn ratio', unit: 'x', nexus: 1.78, peer_median: 1.42, peer_p25: 1.12, peer_p75: 1.94, direction: 'lower_better', peers_n: 9, note: 'High ratio = liability growing faster than redemption. Burn-down campaign due.' },
  { metric: 'Breakage rate', unit: '%', nexus: 26, peer_median: 22, peer_p25: 14, peer_p75: 34, direction: 'lower_better', peers_n: 9, note: 'Middle-of-pack. Industry trending down with member education.' },
  { metric: 'Time-to-burn (median)', unit: 'days', nexus: 94, peer_median: 68, peer_p25: 42, peer_p75: 121, direction: 'lower_better', peers_n: 9, note: 'Peers burn 38% faster — hoarding signal for Nexus.' },
  { metric: 'CLV:CAC ratio', unit: 'x', nexus: 4.8, peer_median: 3.6, peer_p25: 2.4, peer_p75: 5.7, direction: 'higher_better', peers_n: 10, note: 'Strong unit economics — Acme Retail anchor drives low CAC.' },
  { metric: 'App store rating (avg)', unit: '★', nexus: 3.3, peer_median: 4.1, peer_p25: 3.8, peer_p75: 4.5, direction: 'higher_better', peers_n: 11, note: 'Underperforming — see /app-health for root cause.' },
];

// ── Experiments / holdout ledger ─────────────────────────────────
export type Experiment = {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'paused' | 'stopped_early';
  started: string;
  ended?: string;
  treatment_n: number;
  control_n: number;
  srm_p: number; // sample-ratio-mismatch check
  primary_metric: string;
  treatment_rate: number;
  control_rate: number;
  lift_pct: number;
  p_value: number;
  ci_low: number;
  ci_high: number;
  sequential_stop?: 'alpha_spend' | 'bayesian' | 'none';
  verdict: 'shipped' | 'killed' | 'inconclusive' | 'pending';
  owner: string;
};

export const EXPERIMENTS_DEMO: Experiment[] = [
  {
    id: 'EXP-2026-12',
    name: 'Hibernating-whales save-loop · Apr-2026',
    status: 'running',
    started: '2026-04-10',
    treatment_n: 2_890,
    control_n: 320,
    srm_p: 0.62,
    primary_metric: '14-day redeem probability',
    treatment_rate: 0.234,
    control_rate: 0.148,
    lift_pct: 58.1,
    p_value: 0.003,
    ci_low: 36.2,
    ci_high: 81.4,
    sequential_stop: 'alpha_spend',
    verdict: 'pending',
    owner: 'save-loop agent',
  },
  {
    id: 'EXP-2026-11',
    name: 'Bronze tier-upgrade nudge',
    status: 'completed',
    started: '2026-03-18',
    ended: '2026-04-08',
    treatment_n: 18_200,
    control_n: 2_040,
    srm_p: 0.48,
    primary_metric: 'Bronze → Silver upgrade rate',
    treatment_rate: 0.089,
    control_rate: 0.062,
    lift_pct: 43.5,
    p_value: 0.001,
    ci_low: 22.1,
    ci_high: 68.3,
    sequential_stop: 'none',
    verdict: 'shipped',
    owner: 'Marketing',
  },
  {
    id: 'EXP-2026-10',
    name: 'Bundle: Fresh Food + Personal Care',
    status: 'stopped_early',
    started: '2026-03-05',
    ended: '2026-03-19',
    treatment_n: 48_000,
    control_n: 5_200,
    srm_p: 0.32,
    primary_metric: 'Attach rate (Personal Care)',
    treatment_rate: 0.141,
    control_rate: 0.138,
    lift_pct: 2.2,
    p_value: 0.41,
    ci_low: -4.1,
    ci_high: 8.8,
    sequential_stop: 'bayesian',
    verdict: 'killed',
    owner: 'Merchandising',
  },
  {
    id: 'EXP-2026-09',
    name: 'Ramadan pre-stock SMS',
    status: 'completed',
    started: '2026-02-01',
    ended: '2026-02-16',
    treatment_n: 92_000,
    control_n: 10_200,
    srm_p: 0.77,
    primary_metric: 'Week -1 footfall',
    treatment_rate: 2.14,
    control_rate: 1.61,
    lift_pct: 33.0,
    p_value: 0.0001,
    ci_low: 21.8,
    ci_high: 44.2,
    sequential_stop: 'none',
    verdict: 'shipped',
    owner: 'Ops',
  },
  {
    id: 'EXP-2026-08',
    name: 'Reduce OTP retries from 3 → 2',
    status: 'paused',
    started: '2026-01-22',
    ended: '2026-01-28',
    treatment_n: 42_000,
    control_n: 4_800,
    srm_p: 0.04, // SRM failed
    primary_metric: 'Login success rate',
    treatment_rate: 0.89,
    control_rate: 0.91,
    lift_pct: -2.2,
    p_value: 0.12,
    ci_low: -5.4,
    ci_high: 1.1,
    sequential_stop: 'none',
    verdict: 'inconclusive',
    owner: 'Engineering',
  },
];

// ── Pricing elasticity baseline ──────────────────────────────────
export const ELASTICITY_BASE = {
  revenue_monthly: 5_280_000, // AED
  points_earn_ratio: 1.0, // Nexus per AED
  points_redeem_ratio: 200, // Nexus per AED redemption
  breakage_rate: 0.26,
  members: 1_180_000,
  active_rate: 0.34,
  // price-elasticity of redemption volume wrt earn rate (grocery/loyalty literature)
  earn_elasticity: 0.62,
  // cross-price elasticity of breakage wrt redemption generosity
  breakage_elasticity: -0.45,
} as const;

// ── IFRS 15 quarterly close ──────────────────────────────────────
export const IFRS_QUARTERLY_DEMO = {
  quarter: '2026-Q1',
  opening_liability_aed: 4_820_000,
  points_issued_aed: 26_400 * 5.28, // revenue × breakage factor
  points_redeemed_aed: 18_720,
  breakage_release_aed: 1_240,
  closing_liability_aed: 5_090_000,
  sensitivity_1pp: 62_400, // AED per 1pp breakage change
  notes: [
    'Breakage rate constant at 26% (IFRS 15 B20 expected-value approach).',
    'Deferred revenue = outstanding points × (1 - breakage) / 200.',
    '26% breakage tested against observed 24-month historical expiry rate; variance within ±1.2pp.',
    'Audit trail: all daily liability snapshots in points_liability_daily table, 90-day retention.',
  ],
} as const;

// ── Fraud flags ──────────────────────────────────────────────────
export type FraudFlag = {
  id: string;
  ts: string;
  member: string;
  kind: 'velocity' | 'geo_impossible' | 'pos_reversal_abuse' | 'tier_farming' | 'partner_collision';
  severity: 'low' | 'medium' | 'high';
  score: number; // 0-1
  explanation: string; // SHAP-style
  loss_aed: number;
  status: 'open' | 'confirmed_fraud' | 'false_positive';
};

export const FRAUD_FLAGS_DEMO: FraudFlag[] = [
  {
    id: 'FR-2026-04-18-01',
    ts: '2026-04-18T06:24:00Z',
    member: 'C-74812',
    kind: 'geo_impossible',
    severity: 'high',
    score: 0.92,
    explanation: 'Redemption in Dubai Marina 07:12 GST and Abu Dhabi Mall 07:41 GST — 27 min travel window vs minimum 110 min drive. Card-present transactions at both.',
    loss_aed: 840,
    status: 'open',
  },
  {
    id: 'FR-2026-04-17-14',
    ts: '2026-04-17T14:30:00Z',
    member: 'C-38190',
    kind: 'velocity',
    severity: 'medium',
    score: 0.74,
    explanation: '8 redemptions in 18 minutes at 4 different stores. 99.4 percentile of member redemption velocity distribution.',
    loss_aed: 320,
    status: 'open',
  },
  {
    id: 'FR-2026-04-16-07',
    ts: '2026-04-16T20:15:00Z',
    member: 'C-52408',
    kind: 'tier_farming',
    severity: 'medium',
    score: 0.68,
    explanation: '14 split transactions under AED 10 across 2 hours — consistent with tier-threshold gaming rather than real shopping pattern.',
    loss_aed: 180,
    status: 'confirmed_fraud',
  },
  {
    id: 'FR-2026-04-15-22',
    ts: '2026-04-15T11:05:00Z',
    member: 'C-19477',
    kind: 'pos_reversal_abuse',
    severity: 'low',
    score: 0.55,
    explanation: '3 reversals in last 14d always following Nexus-earning transactions. Not yet at statistical significance.',
    loss_aed: 45,
    status: 'false_positive',
  },
  {
    id: 'FR-2026-04-14-03',
    ts: '2026-04-14T09:20:00Z',
    member: 'C-88215',
    kind: 'partner_collision',
    severity: 'high',
    score: 0.89,
    explanation: 'Partner A issued 8,200 Nexus in single transaction; Partner B redeemed 8,150 Nexus at exact same second. Probability by chance < 0.001.',
    loss_aed: 41,
    status: 'open',
  },
];

// ── Strategic roadmap — CEO lens ─────────────────────────────────
export const STRATEGIC_ROADMAP_DEMO = [
  { horizon: 'This quarter', title: 'Pre-Ramadan redemption campaign', owner: 'Marketing', note: 'Burn down AED 1.8M in expiring Nexus before Ramadan surge.' },
  { horizon: 'This quarter', title: 'Bahrain expansion to 10 stores', owner: 'Ops', note: '+38% day-30 activation rate; strong tailwind from pilot.' },
  { horizon: 'Next quarter', title: 'PDPL enforcement dry-run', owner: 'Legal + Engineering', note: 'Close the 2 gaps in /compliance before 2027-01-01.' },
  { horizon: 'Next quarter', title: 'Tier launch — replace informal RFM', owner: 'Product', note: 'Activate /tier-migration model as live program.' },
  { horizon: 'Next half', title: 'Coalition partner #36 (signed)', owner: 'BD', note: 'Dilutes HHI from 2,140 toward 1,800 (diverse).' },
  { horizon: 'Next half', title: 'Open API for sub-brands', owner: 'Platform', note: 'Per-partner RLS + /chat scoped to brand slice.' },
] as const;

// ── CLV decomposition ────────────────────────────────────────────
export const CLV_DECOMPOSITION_DEMO = {
  median_clv: 432, // AED 12-mo
  components: [
    { factor: 'Repeat rate', value: 0.64, weight: 0.35, note: 'Members transacting ≥2× in 90d.' },
    { factor: 'Frequency (txns/mo)', value: 4.2, weight: 0.25, note: 'Higher for Platinum (6.8) vs Bronze (2.1).' },
    { factor: 'Monetary (AED/txn)', value: 164, weight: 0.22, note: 'ATV; grocery-dominated basket.' },
    { factor: 'Margin proxy (AED/member)', value: 52, weight: 0.12, note: 'Contribution margin net of Nexus accrual cost.' },
    { factor: 'Life (months)', value: 14.8, weight: 0.06, note: 'Observation-window proxy; capped at 24.' },
  ],
} as const;

// ── SHAP-to-English for churn ────────────────────────────────────
export const SHAP_ENGLISH_DEMO = {
  member: 'C-91241 · Hibernating Whale',
  churn_probability: 0.84,
  decision_plot: [
    { feature: 'recency_days', raw: 87, shap: 0.28, narrative: '87 days since last visit — furthest from active baseline.' },
    { feature: 'frequency_90d', raw: 1, shap: 0.22, narrative: 'Only 1 transaction in 90 days; same-tier peers average 4.8.' },
    { feature: 'redeem_ratio', raw: 0.12, shap: 0.14, narrative: 'Low redemption — Nexus accruing unspent; trust erosion signal.' },
    { feature: 'last_tier_change_days', raw: 240, shap: -0.05, narrative: 'Tier has been stable 240 days — mildly protective.' },
    { feature: 'cross_partner_visits', raw: 0, shap: 0.09, narrative: 'Has never used coalition cross-partner — single-brand member.' },
  ],
  plain_english:
    'This member is high-risk primarily because they have not visited in 87 days, they only transacted once in the last 90 days, and they are accruing Nexus without redeeming. A targeted "your points are waiting" campaign has a 58% historical lift on similar profiles.',
} as const;

