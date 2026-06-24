import type {
  ActNowCustomer,
  AnomalyPoint,
  BundleRecommendation,
  CategoryMixItem,
  ChatResponse,
  ChurnResponse,
  ClvResponse,
  CoalitionFlowResponse,
  CohortCell,
  CooAlertsResponse,
  CooLifecycleFunnel,
  CooPartnersResponse,
  CooSystemHealth,
  FiltersState,
  IfrsAgingResponse,
  InsightBundle,
  KpiResponse,
  MarketBasketRule,
  NextBestAction,
  RecommendationBundle,
  RfmSummary,
  StorePerfItem,
  TierDistItem,
  TierMigrationLink,
  TierMigrationResponse,
  TopProductItem,
  TrendResponse,
  FraudSummary,
  ForecastResponse,
  BannerResponse,
  CreativeRequest,
  CreativeResponse,
  ReceiptScanRequest,
  ReceiptScanResponse,
  ElasticitySimulateRequest,
  ElasticitySimulateResponse,
  AnomalyExplainRequest,
  AnomalyExplainResponse,
  SaveLoopRequest,
  SaveLoopResponse,
  FraudGraphResponse,
  FraudGraphFilters,
} from './types';

import { getActivePartner, getPartnerScalar, scaleResponse } from './partner';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`;
}

function filtersToQuery(filters: FiltersState): Record<string, string | undefined> {
  return {
    store: filters.store,
    category: filters.category,
    tier: filters.tier,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = API_BASE.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as T;
  // Per-partner synthetic scaling. See lib/partner.ts. Coalition view = 1.0
  // (passthrough); a specific partner view scales numeric fields by that
  // partner's share. Mutations (POST /chat etc.) skip scaling because the
  // answer text is the value, not the numbers inside the payload.
  const isMutation = init?.method && init.method.toUpperCase() !== 'GET';
  if (isMutation) return json;
  const partner = getActivePartner();
  const factor = getPartnerScalar(partner);
  return scaleResponse(json, factor);
}

// ── Overview ───────────────────────────────────────────────
export const api = {
  kpi: (filters: FiltersState = {}) =>
    request<KpiResponse>(`/api/v1/kpi${buildQuery(filtersToQuery(filters))}`),

  revenueTrend: (filters: FiltersState = {}) =>
    request<TrendResponse>(
      `/api/v1/overview/revenue-trend${buildQuery(filtersToQuery(filters))}`,
    ),

  categoryMix: (filters: FiltersState = {}) =>
    request<CategoryMixItem[]>(
      `/api/v1/overview/category-mix${buildQuery(filtersToQuery(filters))}`,
    ),

  storePerformance: (filters: FiltersState = {}) =>
    request<StorePerfItem[]>(
      `/api/v1/overview/store-performance${buildQuery(filtersToQuery(filters))}`,
    ),

  tierDistribution: (filters: FiltersState = {}) =>
    request<TierDistItem[]>(
      `/api/v1/overview/tier-distribution${buildQuery(filtersToQuery(filters))}`,
    ),

  topProducts: (filters: FiltersState = {}, limit = 10) =>
    request<TopProductItem[]>(
      `/api/v1/overview/top-products${buildQuery({ ...filtersToQuery(filters), limit })}`,
    ),

  insightsHome: (filters: FiltersState = {}) =>
    request<InsightBundle>(
      `/api/v1/insights/home${buildQuery(filtersToQuery(filters))}`,
    ),

  // ── Market Basket ───────────────────────────────────────
  basketRules: (
    params: {
      by_category?: boolean;
      min_support?: number;
      min_confidence?: number;
      limit?: number;
    } = {},
    filters: FiltersState = {},
  ) =>
    request<MarketBasketRule[]>(
      `/api/v1/market-basket/rules${buildQuery({
        ...params,
        ...filtersToQuery(filters),
      })}`,
    ),

  basketBundle: (anchor: string, limit = 5) =>
    request<BundleRecommendation[]>(
      `/api/v1/market-basket/bundles/${encodeURIComponent(anchor)}${buildQuery({ limit })}`,
    ),

  basketInsights: () =>
    request<InsightBundle>(`/api/v1/market-basket/insights`),

  // ── Segments ────────────────────────────────────────────
  rfm: (limit = 500) => request<RfmSummary>(`/api/v1/segments/rfm${buildQuery({ limit })}`),
  tierMigration: (filters: FiltersState = {}) =>
    request<TierMigrationLink[]>(
      `/api/v1/segments/tier-migration${buildQuery(filtersToQuery(filters))}`,
    ),
  tierMigrationMatrix: (filters: FiltersState = {}) =>
    request<TierMigrationResponse>(
      `/api/v1/segments/tier-migration/matrix${buildQuery(filtersToQuery(filters))}`,
    ),
  segmentInsights: () => request<InsightBundle>(`/api/v1/segments/insights`),

  // ── Predictive ──────────────────────────────────────────
  churn: (limit = 50) => request<ChurnResponse>(`/api/v1/predictive/churn${buildQuery({ limit })}`),
  clv: (limit = 200) => request<ClvResponse>(`/api/v1/predictive/clv${buildQuery({ limit })}`),
  actNow: (limit = 50) =>
    request<ActNowCustomer[]>(`/api/v1/predictive/act-now${buildQuery({ limit })}`),
  predictiveInsights: () => request<InsightBundle>(`/api/v1/predictive/insights`),

  // ── Recommendations ─────────────────────────────────────
  recommendations: (customerId: string, limit = 6) =>
    request<RecommendationBundle>(
      `/api/v1/recommendations/${encodeURIComponent(customerId)}${buildQuery({ limit })}`,
    ),

  // ── Chat / NBA / Cohort / Anomaly ──────────────────────
  chat: (question: string) =>
    request<ChatResponse>(`/api/v1/chat`, {
      method: 'POST',
      body: JSON.stringify({ question, history: [] }),
    }),

  nba: (customerId: string) =>
    request<NextBestAction>(`/api/v1/nba/${encodeURIComponent(customerId)}`),

  cohort: () => request<CohortCell[]>(`/api/v1/cohort/retention`),

  anomaly: (z = 2.5, filters: FiltersState = {}) =>
    request<AnomalyPoint[]>(
      `/api/v1/anomaly/daily-revenue${buildQuery({ z, ...filtersToQuery(filters) })}`,
    ),

  // ── COO (Coalition Operations) ──────────────────────────
  cooSystemHealth: (filters: FiltersState = {}) =>
    request<CooSystemHealth>(`/api/v1/coo/system-health${buildQuery(filtersToQuery(filters))}`),
  cooPartners: (filters: FiltersState = {}) =>
    request<CooPartnersResponse>(`/api/v1/coo/partners${buildQuery(filtersToQuery(filters))}`),
  cooLifecycleFunnel: (filters: FiltersState = {}) =>
    request<CooLifecycleFunnel>(`/api/v1/coo/lifecycle-funnel${buildQuery(filtersToQuery(filters))}`),
  cooAlerts: (filters: FiltersState = {}) =>
    request<CooAlertsResponse>(`/api/v1/coo/alerts${buildQuery(filtersToQuery(filters))}`),

  // ── Meta ───────────────────────────────────────────────────────
  dateBounds: () => request<{ min: string; max: string }>(`/api/v1/meta/date-bounds`),

  // ── Fraud + Forecast ───────────────────────────────────────────
  fraudFlags: (filters: FiltersState = {}) =>
    request<FraudSummary>(`/api/v1/fraud/flags${buildQuery(filtersToQuery(filters))}`),
  forecastRevenue: (horizon = 7) =>
    request<ForecastResponse>(`/api/v1/forecast/revenue${buildQuery({ horizon })}`),

  // ── Dynamic banners ────────────────────────────────────────────
  banner: (page: string, filters: FiltersState = {}, opts: { polish?: boolean } = {}) =>
    request<BannerResponse>(
      `/api/v1/insights/banner/${page}${buildQuery({ ...filtersToQuery(filters), polish: opts.polish ? '1' : undefined })}`,
    ),

  // ── Coalition Flow (Earn → Redeem Sankey) ──────────────────────
  coalitionFlow: (filters: FiltersState = {}) =>
    request<CoalitionFlowResponse>(
      `/api/v1/flow/category${buildQuery(filtersToQuery(filters))}`,
    ),

  // ── IFRS 15 Aging Waterfall ────────────────────────────────────
  ifrsAging: (filters: FiltersState = {}) =>
    request<IfrsAgingResponse>(
      `/api/v1/ifrs/aging${buildQuery(filtersToQuery(filters))}`,
    ),
  ifrsExpiringCsvUrl: (filters: FiltersState = {}) => {
    const base = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
    return `${base}/api/v1/ifrs/expiring.csv${buildQuery(filtersToQuery(filters))}`;
  },

  // ── Creative Agent (Ramadan-aware bilingual generator) ─────────
  creativeGenerate: (body: CreativeRequest) =>
    request<CreativeResponse>(`/api/v1/creative/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Receipt OCR (off-SKU earning) ──────────────────────────────
  receiptScan: (body: ReceiptScanRequest) =>
    request<ReceiptScanResponse>(`/api/v1/ledger/receipt/json`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Elasticity what-if simulator ───────────────────────────────
  elasticitySimulate: (body: ElasticitySimulateRequest) =>
    request<ElasticitySimulateResponse>(`/api/v1/elasticity/simulate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Anomaly-Explain agent ──────────────────────────────────────
  anomalyExplain: (body: AnomalyExplainRequest) =>
    request<AnomalyExplainResponse>(`/api/v1/anomaly/explain`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Churn-Save Loop agent ──────────────────────────────────────
  saveLoopRun: (body: SaveLoopRequest) =>
    request<SaveLoopResponse>(`/api/v1/save-loop/run`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Graph-ML Fraud Rings ───────────────────────────────────────
  fraudGraph: (filters: FraudGraphFilters = {}) =>
    request<FraudGraphResponse>(
      `/api/v1/fraud/graph${buildQuery({
        date_from: filters.date_from,
        date_to: filters.date_to,
        min_ring_size: filters.min_ring_size,
      })}`,
    ),
};
