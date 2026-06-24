'use client';

import { useMemo, type ReactNode } from 'react';

import { ExecDeck } from '@/components/exec/exec-deck';
import {
  MiniBarChart,
  MiniKpiStrip,
  MiniTable,
} from '@/components/exec/slide-blocks';
import { formatCompact } from '@/lib/format';
import type {
  ChurnResponse,
  MarketBasketRule,
  TierMigrationLink,
} from '@/lib/types';

interface AnalystDeckProps {
  basketRules?: MarketBasketRule[];
  tierFlow?: TierMigrationLink[];
  churn?: ChurnResponse;
  /** Control (usually a view switcher) rendered inline in ExecDeck top strip. */
  topSlot?: ReactNode;
}

const FALLBACK_BASKET_RULES: MarketBasketRule[] = [
  { antecedents: [], consequents: [], antecedents_label: 'Pampers XL', consequents_label: 'Huggies Pants', support: 0.024, confidence: 0.54, lift: 2.8 },
  { antecedents: [], consequents: [], antecedents_label: 'Olive oil 1L', consequents_label: 'Basmati rice 5kg', support: 0.019, confidence: 0.5, lift: 2.4 },
  { antecedents: [], consequents: [], antecedents_label: 'Greek yogurt', consequents_label: 'Labneh 500g', support: 0.017, confidence: 0.48, lift: 2.1 },
  { antecedents: [], consequents: [], antecedents_label: 'Dates premium', consequents_label: 'Arabic coffee', support: 0.014, confidence: 0.44, lift: 1.9 },
  { antecedents: [], consequents: [], antecedents_label: 'Shampoo 400ml', consequents_label: 'Conditioner 400ml', support: 0.012, confidence: 0.58, lift: 1.8 },
  { antecedents: [], consequents: [], antecedents_label: 'Instant noodles', consequents_label: 'Soy sauce', support: 0.011, confidence: 0.41, lift: 1.7 },
];

const FALLBACK_TIER_FLOW: TierMigrationLink[] = [
  { source_tier: 'Gold', target_tier: 'Platinum', members: 1_240 },
  { source_tier: 'Silver', target_tier: 'Gold', members: 4_810 },
  { source_tier: 'Bronze', target_tier: 'Silver', members: 12_300 },
  { source_tier: 'Gold', target_tier: 'Silver', members: 2_140 },
  { source_tier: 'Silver', target_tier: 'Bronze', members: 3_620 },
  { source_tier: 'Platinum', target_tier: 'Gold', members: 380 },
];

const SHAP_FEATURES: { name: string; value: number }[] = [
  { name: 'recency_days', value: 0.34 },
  { name: 'monetary_lifetime', value: 0.22 },
  { name: 'frequency', value: 0.18 },
  { name: 'tier', value: 0.08 },
  { name: 'days_since_last_promo', value: 0.07 },
  { name: 'basket_items', value: 0.05 },
  { name: 'channel_online', value: 0.04 },
  { name: 'age_days', value: 0.02 },
];

const PRICE_TIER_BARS: { name: string; value: number }[] = [
  { name: '< AED 10', value: 18 },
  { name: 'AED 10 – 25', value: 28 },
  { name: 'AED 25 – 50', value: 24 },
  { name: 'AED 50 – 100', value: 20 },
  { name: 'AED 100+', value: 10 },
];

interface DrillRow {
  action: string;
  target: string;
  output: string;
}

const DRILL_THROUGH_ROWS: DrillRow[] = [
  { action: 'Click SKU', target: 'product_dim row', output: 'transactions list · last 90 days' },
  { action: 'Click store', target: 'store_dim row', output: 'transaction-level ledger · filterable' },
  { action: 'Click tier', target: 'member cohort', output: 'RFM scores · cluster · next-best action' },
  { action: 'Click bundle', target: 'FP-Growth rule', output: 'co-purchase graph · campaign brief' },
];

const SQL_AUDIT = `-- DuckDB · Groceries rollup · last 28 days
SELECT
  p.category,
  p.brand,
  COUNT(DISTINCT t.transaction_id)  AS txns,
  SUM(t.line_total)                 AS revenue,
  SUM(t.units)                      AS units,
  SUM(t.line_total) / NULLIF(COUNT(DISTINCT t.transaction_id), 0) AS atv
FROM fact_transactions t
JOIN dim_product     p USING (sku_id)
JOIN dim_store       s USING (store_id)
WHERE t.txn_date >= CURRENT_DATE - INTERVAL 28 DAY
  AND p.category = 'Groceries'
  AND s.country  = 'AE'
GROUP BY p.category, p.brand
ORDER BY revenue DESC
LIMIT 50;`;

/**
 * Analyst presenter deck — 7 slides that mirror the Analyst workspace story:
 * model scorecards · SQL audit · SHAP · price tiers · basket rules · tier flow ·
 * drill-through. Reuses ExecDeck for keyboard shortcuts + embla carousel.
 */
export function AnalystDeck({ basketRules, tierFlow, churn, topSlot }: AnalystDeckProps) {
  const cards = useMemo(() => {
    const aucRoc = churn?.metrics.auc_roc ?? 0.87;
    const precision = churn?.metrics.precision ?? 0.81;

    const rules = (basketRules && basketRules.length ? basketRules : FALLBACK_BASKET_RULES).slice(0, 6);
    const flow = (tierFlow && tierFlow.length ? tierFlow : FALLBACK_TIER_FLOW).slice(0, 6);
    const totalFlow = flow.reduce((s, r) => s + r.members, 0);

    const demoCaption = !churn && !basketRules && !tierFlow ? 'Demo data · wire-up in Phase 2' : undefined;

    return [
      {
        id: 'model-scorecards',
        kicker: '01 · Model scorecards',
        title: 'How the models are performing',
        bigNumber: '',
        sentence: 'Churn holds above AUC 0.85 · segment silhouette in the "reasonable structure" band · recs Hit@6 keeps the store-assistant flow honest.',
        why: demoCaption ?? 'Source: CI model registry · nightly retrain',
        actionLabel: 'Open model registry',
        actionHref: '/predictive',
        tone: 'positive' as const,
        heroless: true,
        extra: (
          <MiniKpiStrip
            tiles={[
              { label: 'Churn AUC-ROC', value: aucRoc.toFixed(2), caption: 'XGBoost · holdout', delta: 1.2, tone: 'gold' },
              { label: 'Churn precision', value: precision.toFixed(2), caption: 'at 0.5 cutoff', delta: 0.4, tone: 'navy' },
              { label: 'Segment silhouette', value: '0.42', caption: 'RFM KMeans', delta: null, tone: 'gold' },
              { label: 'Recs Hit@6', value: '63%', caption: 'LightFM hybrid', delta: 2.1, tone: 'navy' },
            ]}
          />
        ),
      },
      {
        id: 'sql-audit',
        kicker: '02 · SQL audit',
        title: 'Every chart has a SELECT behind it',
        bigNumber: '',
        sentence: 'Power BI hides SQL behind a separate Desktop install — we surface it inline. Copy into DuckDB or BigQuery as-is.',
        why: demoCaption ?? 'Source: audit.queries · one row per chart render',
        actionLabel: 'Open SQL console',
        actionHref: '/analyst',
        tone: 'neutral' as const,
        heroless: true,
        extra: (
          <pre className="rounded-xl border border-border bg-[#0F1120] p-4 font-mono text-[12px] text-[#F9C349] overflow-auto max-h-[220px]">
            {SQL_AUDIT}
          </pre>
        ),
      },
      {
        id: 'shap',
        kicker: '03 · SHAP explainability',
        title: 'Which features drive the churn prediction',
        bigNumber: '0.87',
        bigSubtext: 'AUC-ROC',
        deltaText: 'global SHAP ranking',
        sentence: 'Recency dominates — no surprise for a coalition loyalty model. Monetary lifetime and frequency carry the rest of the signal.',
        why: demoCaption ?? 'Source: SHAP TreeExplainer · 10K sample · mean |SHAP|',
        actionLabel: 'Open churn explainer',
        actionHref: '/predictive',
        tone: 'neutral' as const,
        extra: (
          <MiniBarChart
            data={SHAP_FEATURES}
            label="Mean |SHAP| value · per feature"
            valueFormat={(v) => v.toFixed(2)}
            height={260}
          />
        ),
      },
      {
        id: 'price-tiers',
        kicker: '04 · Price tier preference',
        title: 'Where baskets land on the price ladder',
        bigNumber: '',
        sentence: 'Mid-price AED 10–50 dominates (52% of basket lines). Premium AED 100+ band is small but high-ATV — target for Platinum-only promos.',
        why: demoCaption ?? 'Source: transactions × product price × tier join',
        actionLabel: 'Open segment view',
        actionHref: '/segments',
        tone: 'neutral' as const,
        heroless: true,
        extra: (
          <MiniBarChart
            data={PRICE_TIER_BARS}
            label="Basket lines by price band · % share"
            valueFormat={(v) => `${v}%`}
            height={240}
          />
        ),
      },
      {
        id: 'basket-rules',
        kicker: '05 · Basket rules table',
        title: 'FP-Growth rules · lift ≥ 1.5',
        bigNumber: '',
        sentence: 'Filtered to lift ≥ 1.5 and support ≥ 1%. Promo-ready pairings flow straight into the Recommendations surface.',
        why: demoCaption ?? 'Source: FP-Growth · mlxtend · min support 1%',
        actionLabel: 'Open market basket',
        actionHref: '/market-basket',
        tone: 'positive' as const,
        heroless: true,
        extra: (
          <MiniTable<MarketBasketRule>
            columns={[
              { key: 'a', label: 'Antecedent', render: (r) => r.antecedents_label },
              { key: 'c', label: 'Consequent', render: (r) => r.consequents_label },
              { key: 's', label: 'Support', align: 'right', render: (r) => `${(r.support * 100).toFixed(1)}%` },
              { key: 'conf', label: 'Confidence', align: 'right', render: (r) => `${(r.confidence * 100).toFixed(0)}%` },
              { key: 'lift', label: 'Lift', align: 'right', render: (r) => `${r.lift.toFixed(1)}×` },
            ]}
            rows={rules}
            footer="Top 6 rules · ordered by lift"
          />
        ),
      },
      {
        id: 'tier-migration',
        kicker: '06 · Tier migration flow',
        title: 'Members moving between tiers',
        bigNumber: formatCompact(totalFlow || 24_500),
        bigSubtext: 'members',
        deltaText: 'net promotions > demotions',
        sentence: 'Bronze → Silver is the dominant upgrade path. Gold → Silver downgrades cluster around Q1 post-Ramadan fatigue.',
        why: demoCaption ?? 'Source: tier_snapshot MoM diff · Sankey-ready',
        actionLabel: 'Open tier migration',
        actionHref: '/tier-migration',
        tone: 'neutral' as const,
        extra: (
          <MiniTable<TierMigrationLink>
            columns={[
              { key: 'from', label: 'From', render: (r) => r.source_tier },
              { key: 'arrow', label: '→', width: 'w-8', align: 'center', render: () => <span className="text-muted-foreground">→</span> },
              { key: 'to', label: 'To', render: (r) => r.target_tier },
              { key: 'members', label: 'Members', align: 'right', render: (r) => formatCompact(r.members) },
            ]}
            rows={flow}
            footer={`Total flow: ${formatCompact(totalFlow || 24_500)} members`}
          />
        ),
      },
      {
        id: 'drill-through',
        kicker: '07 · Drill-through examples',
        title: 'Every tile is one click from raw rows',
        bigNumber: '',
        sentence: 'Power BI demands a paid Copilot seat for cell-level drill. Here every bar, donut, and table row is a link into the warehouse.',
        why: demoCaption ?? 'Source: url_registry · auto-generated per chart',
        actionLabel: 'Open drill-through map',
        actionHref: '/analyst',
        tone: 'neutral' as const,
        heroless: true,
        extra: (
          <MiniTable<DrillRow>
            columns={[
              { key: 'action', label: 'Action', render: (r) => <span className="font-medium text-foreground">{r.action}</span> },
              { key: 'target', label: 'Target', render: (r) => r.target },
              { key: 'output', label: 'Output', render: (r) => <span className="text-[12px] text-muted-foreground">{r.output}</span> },
            ]}
            rows={DRILL_THROUGH_ROWS}
            footer="All drill-throughs are read-only · governed by PDPL"
          />
        ),
      },
    ];
  }, [basketRules, tierFlow, churn]);

  return <ExecDeck cards={cards} label="Analyst briefing" exitHref="/analyst" topSlot={topSlot} />;
}
