/**
 * Partner-aware data scaling. Backend returns the same coalition-wide numbers
 * regardless of the active partner (single-tenant demo data). To make the
 * partner switcher visibly change the dashboard, we intercept responses and
 * deterministically scale revenue / member / count fields by a per-partner
 * factor. All-partners view stays 1.0 (original numbers). Every other partner
 * gets a stable fraction that roughly matches their real Nexus contribution.
 *
 * This is a synthetic shim — when the backend eventually adds per-partner
 * filtering, remove the scaling step and let the real data flow through.
 */

export const STORAGE_KEY = 'nexus:active-partner';

export const PARTNER_SCALARS: Record<string, number> = {
  all: 1.0,
  acme: 0.34,
  'gulf-news': 0.04,
  joyalukkas: 0.18,
  bafleh: 0.07,
  'sharaf-travel': 0.11,
  dadabhai: 0.05,
  megamart: 0.08,
  macromart: 0.05,
  petland: 0.03,
  marhaba: 0.04,
  smiles: 0.55,
};

export const PARTNER_LABELS: Record<string, string> = {
  all: 'All partners',
  acme: 'Acme Retail',
  'gulf-news': 'Gulf News',
  joyalukkas: 'Joyalukkas',
  bafleh: 'Bafleh Jewellery',
  'sharaf-travel': 'Sharaf Travel',
  dadabhai: 'Dadabhai Travel',
  megamart: 'MegaMart',
  macromart: 'MacroMart',
  petland: 'Petland',
  marhaba: 'marhaba Services',
  smiles: 'Smiles (e&)',
};

export function getActivePartner(): string {
  if (typeof window === 'undefined') return 'all';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && PARTNER_SCALARS[stored] !== undefined) return stored;
  return 'all';
}

export function getPartnerScalar(partnerId?: string): number {
  const id = partnerId ?? getActivePartner();
  return PARTNER_SCALARS[id] ?? 1.0;
}

export function getPartnerLabel(partnerId?: string): string {
  const id = partnerId ?? getActivePartner();
  return PARTNER_LABELS[id] ?? id;
}

/**
 * Numeric field names that should be scaled. Conservative list — excludes
 * percentages, ratios, dates, IDs, and anything whose value is typically
 * bounded 0-1 (which would look broken after multiplying by 0.3).
 */
const SCALABLE_FIELDS = new Set<string>([
  // Revenue / money
  'revenue',
  'revenue_aed',
  'total_revenue',
  'revenue_total',
  'aed',
  'value',
  'gmv',
  'sales',
  'spend',
  // Counts
  'members',
  'member_count',
  'members_count',
  'active_count',
  'cohort_size',
  'count',
  'total',
  'txn_count',
  'transactions',
  'transaction_count',
  'footfall',
  'basket_count',
  'store_count',
  'unique_members',
  // Points
  'points',
  'points_issued',
  'points_redeemed',
  'points_balance',
  'earn',
  'burn',
  'redemption',
  'redeemed',
  'issued',
  'liability',
  'points_liability',
  // Chart-y
  'expected',
  'actual',
  'forecast',
  'upper',
  'lower',
  'predicted_revenue',
  'predicted_clv_12m',
  'clv',
  'lifetime_value',
  // Anomaly / residuals
  'residual',
  'delta',
]);

/**
 * Fields that look like percentages / ratios and must NEVER be scaled.
 */
const NEVER_SCALE = new Set<string>([
  'redemption_rate',
  'churn_rate',
  'retention_rate',
  'active_rate',
  'precision',
  'recall',
  'auc_roc',
  'confidence',
  'confidence_score',
  'support',
  'lift',
  'score',
  'rank',
  'age',
  'month_offset',
]);

export function scaleResponse<T>(data: T, factor: number): T {
  if (factor === 1.0) return data;
  return walk(data, factor) as T;
}

function walk(node: unknown, factor: number): unknown {
  if (Array.isArray(node)) return node.map((child) => walk(child, factor));
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (NEVER_SCALE.has(k)) {
        out[k] = v;
        continue;
      }
      if (
        SCALABLE_FIELDS.has(k) &&
        typeof v === 'number' &&
        Number.isFinite(v) &&
        Math.abs(v) > 1.5
      ) {
        out[k] = Math.round(v * factor * 100) / 100;
        continue;
      }
      out[k] = walk(v, factor);
    }
    return out;
  }
  return node;
}
