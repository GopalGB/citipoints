/**
 * Turn a free-text copilot request into a structured action plan the page
 * can execute. Regex-first so the demo doesn't depend on a round-trip to
 * the LLM for the filter parse. The LLM still runs in the Ask tab for the
 * narrative answer — this is ONLY the filter intent.
 */

export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface AiActionPlan {
  /** Page to navigate to. Derived from detected intent. */
  targetHref: string;
  /** Human-friendly description of what will happen. */
  summary: string;
  /** Structured filters — used for the `?ai_*` query params. */
  filters: AiFilters;
  /** The prompt to run in the Ask tab in parallel with applying the filter. */
  aiPrompt: string;
}

export interface AiFilters {
  tier?: Tier;
  min_balance?: number;
  max_balance?: number;
  no_activity_days?: number;
  min_clv?: number;
  max_clv?: number;
  segment?: string;
  action_hint?: string;
}

const TIER_RE = /\b(bronze|silver|gold|platinum)\b/i;
const BALANCE_RE =
  /balance\s*(?:of\s*)?(?:>|greater than|above|more than|over)\s*(?:aed\s*|nexus\s*)?([\d,]+(?:\.\d+)?)(\s*k)?/i;
const BALANCE_LT_RE =
  /balance\s*(?:of\s*)?(?:<|less than|below|under)\s*(?:aed\s*|nexus\s*)?([\d,]+(?:\.\d+)?)(\s*k)?/i;
const INACTIVE_RE =
  /(?:no (?:visit|redemption|activity|purchase)|inactive|lapsed)[^\d]*?(\d+)\s*(day|week|month)s?/i;
const CLV_GT_RE =
  /(?:clv|ltv)[^\d]*?(?:>|greater than|above|over|more than)\s*(?:aed\s*)?([\d,]+(?:\.\d+)?)(\s*k)?/i;
const HIGH_CLV_RE = /\b(high[- ]?clv|premium|top[- ]?value|high[- ]?value|top tier)\b/i;

const INTENT_ACTION_RE =
  /\b(draft|send|plan|design|build|write|create)\s+(?:a\s+)?([a-z\- ]+)?\s*(campaign|offer|email|sms|push|journey|flow)/i;

function parseNumberWithK(digits: string, k?: string): number {
  const base = Number(digits.replace(/,/g, ''));
  if (Number.isNaN(base)) return 0;
  return k && /k/i.test(k) ? base * 1000 : base;
}

export function parseIntent(raw: string): AiActionPlan {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const filters: AiFilters = {};

  const tierMatch = TIER_RE.exec(lower);
  if (tierMatch) {
    const t = tierMatch[1].toLowerCase();
    filters.tier = (t.charAt(0).toUpperCase() + t.slice(1)) as Tier;
  }

  const balGt = BALANCE_RE.exec(lower);
  if (balGt) filters.min_balance = parseNumberWithK(balGt[1], balGt[2]);

  const balLt = BALANCE_LT_RE.exec(lower);
  if (balLt) filters.max_balance = parseNumberWithK(balLt[1], balLt[2]);

  const inactive = INACTIVE_RE.exec(lower);
  if (inactive) {
    const n = Number(inactive[1]);
    const unit = inactive[2].toLowerCase();
    const mult = unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1;
    filters.no_activity_days = n * mult;
  }

  const clv = CLV_GT_RE.exec(lower);
  if (clv) filters.min_clv = parseNumberWithK(clv[1], clv[2]);
  else if (HIGH_CLV_RE.test(lower)) filters.min_clv = 5000;

  const action = INTENT_ACTION_RE.exec(lower);
  if (action) {
    const kind = action[3].toLowerCase();
    filters.action_hint = kind;
  }

  // Pick target page based on what the user is asking for.
  let targetHref = '/segments';
  if (/recommend(ation)?|offer/.test(lower)) targetHref = '/recommendations';
  else if (/churn|at[- ]?risk|save|win[- ]?back|retain|retention/.test(lower))
    targetHref = '/predictive';
  else if (/campaign|email|sms|push|journey/.test(lower)) targetHref = '/save-loop';
  else if (/insight|anomaly|dip|spike/.test(lower)) targetHref = '/insights';
  else if (/basket|co[- ]?purchase|bundle/.test(lower)) targetHref = '/market-basket';

  const parts: string[] = [];
  if (filters.tier) parts.push(`${filters.tier} tier`);
  if (filters.min_balance) parts.push(`balance ≥ ${formatNum(filters.min_balance)} Nexus`);
  if (filters.max_balance) parts.push(`balance < ${formatNum(filters.max_balance)} Nexus`);
  if (filters.no_activity_days)
    parts.push(`no activity ≥ ${filters.no_activity_days} days`);
  if (filters.min_clv) parts.push(`CLV ≥ AED ${formatNum(filters.min_clv)}`);
  if (filters.action_hint) parts.push(`→ draft ${filters.action_hint}`);

  const summary =
    parts.length > 0
      ? `Applying: ${parts.join(' · ')} · on ${labelForHref(targetHref)}`
      : `Running narrative query on ${labelForHref(targetHref)}`;

  return {
    targetHref,
    summary,
    filters,
    aiPrompt: text,
  };
}

export function filtersToQueryParams(f: AiFilters): string {
  const params = new URLSearchParams();
  if (f.tier) params.set('ai_tier', f.tier);
  if (f.min_balance) params.set('ai_min_balance', String(f.min_balance));
  if (f.max_balance) params.set('ai_max_balance', String(f.max_balance));
  if (f.no_activity_days)
    params.set('ai_no_activity_days', String(f.no_activity_days));
  if (f.min_clv) params.set('ai_min_clv', String(f.min_clv));
  if (f.action_hint) params.set('ai_action', f.action_hint);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function parseFiltersFromSearch(search: URLSearchParams): AiFilters {
  const out: AiFilters = {};
  const tier = search.get('ai_tier');
  if (tier) out.tier = tier as Tier;
  const mb = search.get('ai_min_balance');
  if (mb) out.min_balance = Number(mb);
  const xb = search.get('ai_max_balance');
  if (xb) out.max_balance = Number(xb);
  const na = search.get('ai_no_activity_days');
  if (na) out.no_activity_days = Number(na);
  const mc = search.get('ai_min_clv');
  if (mc) out.min_clv = Number(mc);
  const a = search.get('ai_action');
  if (a) out.action_hint = a;
  return out;
}

export function hasAnyAiFilter(f: AiFilters): boolean {
  return Boolean(
    f.tier ||
      f.min_balance ||
      f.max_balance ||
      f.no_activity_days ||
      f.min_clv ||
      f.action_hint,
  );
}

export function filtersToChips(f: AiFilters): string[] {
  const chips: string[] = [];
  if (f.tier) chips.push(`Tier = ${f.tier}`);
  if (f.min_balance) chips.push(`Balance ≥ ${formatNum(f.min_balance)}`);
  if (f.max_balance) chips.push(`Balance < ${formatNum(f.max_balance)}`);
  if (f.no_activity_days)
    chips.push(`Inactive ≥ ${f.no_activity_days}d`);
  if (f.min_clv) chips.push(`CLV ≥ AED ${formatNum(f.min_clv)}`);
  if (f.action_hint) chips.push(`Action: ${f.action_hint}`);
  return chips;
}

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function labelForHref(href: string): string {
  const map: Record<string, string> = {
    '/segments': 'Segments',
    '/recommendations': 'Recommendations',
    '/predictive': 'Churn + CLV',
    '/save-loop': 'Save Loop',
    '/insights': 'AI Insights',
    '/market-basket': 'Market Basket',
  };
  return map[href] ?? href.replace(/^\//, '');
}
