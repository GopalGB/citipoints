'use client';

import { useMemo, type ReactNode } from 'react';

import { ExecDeck } from '@/components/exec/exec-deck';
import {
  BlockRow,
  MiniAreaChart,
  MiniBarChart,
  MiniDonut,
  MiniKpiStrip,
  MiniTable,
} from '@/components/exec/slide-blocks';
import { formatAED, formatAEDCompact, formatCompact } from '@/lib/format';
import type {
  CategoryMixItem,
  InsightBundle,
  InsightPriority,
  KpiResponse,
  StorePerfItem,
  TierDistItem,
  TopProductItem,
  TrendResponse,
} from '@/lib/types';

interface OpsDeckProps {
  kpi?: KpiResponse;
  trend?: TrendResponse;
  categoryMix?: CategoryMixItem[];
  stores?: StorePerfItem[];
  tiers?: TierDistItem[];
  topProducts?: TopProductItem[];
  insights?: InsightBundle;
  /** Control (usually a view switcher) rendered inline in ExecDeck top strip. */
  topSlot?: ReactNode;
}

// Fallback seeds — let cards render tidily before queries resolve.
const FALLBACK_CATEGORY_MIX: CategoryMixItem[] = [
  { category: 'Groceries', revenue: 1_250_000, share_pct: 32.0 },
  { category: 'Fresh', revenue: 980_000, share_pct: 25.1 },
  { category: 'Beauty', revenue: 640_000, share_pct: 16.4 },
  { category: 'Home', revenue: 420_000, share_pct: 10.8 },
  { category: 'Baby', revenue: 280_000, share_pct: 7.2 },
  { category: 'Jewellery', revenue: 330_000, share_pct: 8.5 },
];

const FALLBACK_STORES: StorePerfItem[] = [
  { store: 'Acme Retail Marina', revenue: 680_000, transactions: 4_820, avg_basket: 141 },
  { store: 'Acme Retail JBR', revenue: 604_000, transactions: 4_110, avg_basket: 147 },
  { store: 'Acme Retail MBR', revenue: 512_000, transactions: 3_760, avg_basket: 136 },
  { store: 'Acme Retail Al Wasl', revenue: 488_000, transactions: 3_440, avg_basket: 142 },
  { store: 'Acme Retail Mirdif', revenue: 402_000, transactions: 2_980, avg_basket: 135 },
  { store: 'Acme Retail Barsha', revenue: 361_000, transactions: 2_710, avg_basket: 133 },
];

const FALLBACK_TIERS: TierDistItem[] = [
  { tier: 'Platinum', members: 12_000, revenue: 1_880_000, share_pct: 1.2 },
  { tier: 'Gold', members: 84_000, revenue: 1_540_000, share_pct: 8.4 },
  { tier: 'Silver', members: 290_000, revenue: 1_100_000, share_pct: 29.0 },
  { tier: 'Bronze', members: 610_000, revenue: 760_000, share_pct: 61.4 },
];

const FALLBACK_TOP_PRODUCTS: TopProductItem[] = [
  { sku_id: 'SKU-10421', product_name: 'Basmati rice 5kg', brand: 'Daawat', category: 'Groceries', revenue: 184_000, units: 6_140 },
  { sku_id: 'SKU-20551', product_name: 'Olive oil 1L', brand: 'Borges', category: 'Groceries', revenue: 142_000, units: 4_310 },
  { sku_id: 'SKU-30812', product_name: 'Pampers Pants XL', brand: 'Pampers', category: 'Baby', revenue: 121_000, units: 2_180 },
  { sku_id: 'SKU-40912', product_name: 'Greek yogurt 500g', brand: 'Al Rawabi', category: 'Fresh', revenue: 112_000, units: 8_640 },
  { sku_id: 'SKU-50310', product_name: 'Shampoo 400ml', brand: 'Pantene', category: 'Beauty', revenue: 98_000, units: 3_120 },
  { sku_id: 'SKU-60733', product_name: 'Dates premium 1kg', brand: 'Bateel', category: 'Groceries', revenue: 86_000, units: 1_780 },
];

const FALLBACK_INSIGHTS: InsightBundle = {
  page: 'home',
  generated_at: new Date().toISOString(),
  question: 'What should Ops act on this week?',
  insights: [
    {
      id: 'insight-1',
      title: 'Marina leads on ATV — ship more Platinum lanes',
      text: 'Top-revenue store leads on ATV. Assign more dedicated Platinum lanes.',
      priority: 'opportunity',
      icon: 'sparkles',
    },
    {
      id: 'insight-2',
      title: 'Ramadan starts in 28 days — restock rice & oil now',
      text: 'Historical lift 28–40%. Pre-order rice and oil volumes.',
      priority: 'warning',
      icon: 'alert',
    },
    {
      id: 'insight-3',
      title: 'Bronze tier under-earning — run the upgrade campaign',
      text: '61% of base drives 16% of revenue. Targeted 2× earn promo closes the gap.',
      priority: 'info',
      icon: 'info',
    },
    {
      id: 'insight-4',
      title: 'Jewellery anomaly — confirm Q1 promo plan',
      text: 'Jewellery revenue down 12% WoW. Likely tied to delayed Dubai Shopping Festival push.',
      priority: 'critical',
      icon: 'alert',
    },
  ],
};

const PRIORITY_TO_TONE: Record<InsightPriority, 'positive' | 'negative' | 'neutral' | 'warning'> = {
  critical: 'negative',
  warning: 'warning',
  opportunity: 'positive',
  info: 'neutral',
};

const PRIORITY_BADGE: Record<InsightPriority, string> = {
  critical: 'bg-[#FFE7DD] text-[#C84C2A] ring-[#F2714C]/30',
  warning: 'bg-[#FDF5E0] text-[#B4820E] ring-[#F9C349]/40',
  opportunity: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  info: 'bg-[#1A1D33]/5 text-[#1A1D33] ring-[#1A1D33]/15',
};

interface InsightRow {
  id: string;
  title: string;
  text: string;
  priority: InsightPriority;
}

/**
 * Ops presenter deck — 7 slides that mirror the Ops home-dashboard story:
 * pulse · revenue trend · category mix · stores · tiers · top SKUs · insights.
 *
 * Reuses ExecDeck (keyboard shortcuts, embla carousel) verbatim. This component
 * is a thin data-to-cards mapper.
 */
export function OpsDeck({
  kpi,
  trend,
  categoryMix,
  stores,
  tiers,
  topProducts,
  insights,
  topSlot,
}: OpsDeckProps) {
  const cards = useMemo(() => {
    const revenueTile = kpi?.tiles.find((t) => t.id === 'revenue');
    const txnTile = kpi?.tiles.find((t) => t.id === 'transactions');
    const memberTile = kpi?.tiles.find((t) => t.id === 'active_members' || t.id === 'active_customers');
    const basketTile = kpi?.tiles.find((t) => t.id === 'avg_basket');

    const revenue = revenueTile?.value ?? 0;
    const txns = txnTile?.value ?? 0;
    const activeMembers = memberTile?.value ?? 0;
    const atv = basketTile?.value ?? (txns > 0 ? revenue / txns : 0);

    const TOTAL_MEMBERS = 1_500_000;
    const mauRate = TOTAL_MEMBERS > 0 ? (activeMembers / TOTAL_MEMBERS) * 100 : 0;

    const series = trend?.series ?? [];
    const sparkSeries = series.slice(-21).map((p) => ({ x: p.date, y: Number(p.revenue) }));
    const fullSeries = series.map((p) => ({ x: p.date, y: Number(p.revenue) }));
    const windowRevenue = series.reduce((s, p) => s + Number(p.revenue), 0) || revenue;
    const bestDay = series.length
      ? Math.max(...series.map((p) => Number(p.revenue)))
      : 0;
    const avgDay = series.length ? windowRevenue / series.length : 0;

    const mixRows = (categoryMix && categoryMix.length ? categoryMix : FALLBACK_CATEGORY_MIX).slice(0, 6);
    const topCategory = mixRows[0]?.category ?? 'Groceries';
    const categoryBars = mixRows.map((c) => ({ name: c.category, value: c.revenue }));

    const storeRows = (stores && stores.length ? stores : FALLBACK_STORES).slice(0, 6);
    const topStore = storeRows[0]?.store ?? 'Acme Retail Marina';

    const tierRows = tiers && tiers.length ? tiers : FALLBACK_TIERS;
    const totalTierMembers = tierRows.reduce((s, t) => s + t.members, 0);
    const platinumShare = totalTierMembers > 0 ? (tierRows.find((t) => t.tier === 'Platinum')?.members ?? 0) / totalTierMembers * 100 : 0;
    const goldShare = totalTierMembers > 0 ? (tierRows.find((t) => t.tier === 'Gold')?.members ?? 0) / totalTierMembers * 100 : 0;
    const silverShare = totalTierMembers > 0 ? (tierRows.find((t) => t.tier === 'Silver')?.members ?? 0) / totalTierMembers * 100 : 0;
    const bronzeShare = totalTierMembers > 0 ? (tierRows.find((t) => t.tier === 'Bronze')?.members ?? 0) / totalTierMembers * 100 : 0;

    const tierDonut = tierRows.map((t) => ({
      name: t.tier,
      value: t.members,
      color:
        t.tier === 'Platinum'
          ? '#1A1D33'
          : t.tier === 'Gold'
          ? '#F9C349'
          : t.tier === 'Silver'
          ? '#BFC2D2'
          : '#C47A3D',
    }));

    const productRows = (topProducts && topProducts.length ? topProducts : FALLBACK_TOP_PRODUCTS).slice(0, 6);
    const topProduct = productRows[0]?.product_name ?? 'Basmati rice 5kg';

    const insightList: InsightRow[] = (insights?.insights.length ? insights.insights : FALLBACK_INSIGHTS.insights).map((i) => ({
      id: i.id,
      title: i.title,
      text: i.text,
      priority: i.priority,
    }));

    const demoCaption = !kpi ? 'Demo data · wire-up in Phase 2' : undefined;

    return [
      {
        id: 'pulse',
        kicker: '01 · Coalition pulse',
        title: 'How is the coalition performing right now?',
        bigNumber: formatAEDCompact(revenue || 12_400_000).replace('AED ', ''),
        bigSubtext: 'AED',
        deltaText: revenueTile?.delta_pct != null ? `${revenueTile.delta_pct >= 0 ? '+' : ''}${revenueTile.delta_pct.toFixed(1)}% vs prior` : '+4.2% vs prior',
        sentence: `${formatCompact(txns || 96_200)} transactions · ${formatCompact(activeMembers || 184_000)} active members · ATV ${formatAED(atv || 132)}.`,
        why: demoCaption ?? 'Warehouse refresh every 15 min · source: transactions',
        actionLabel: 'Open dashboard',
        actionHref: '/overview',
        spark: sparkSeries.length ? sparkSeries : undefined,
        tone: 'positive' as const,
        extra: (
          <MiniKpiStrip
            tiles={[
              { label: 'Txns', value: formatCompact(txns || 96_200), caption: 'window', delta: 4.2, tone: 'navy' },
              { label: 'Active members', value: formatCompact(activeMembers || 184_000), caption: 'this window', delta: 3.2, tone: 'positive' },
              { label: 'ATV', value: formatAED(atv || 132), caption: 'per txn', delta: 1.8, tone: 'gold' },
              { label: 'MAU %', value: `${(mauRate || 12.3).toFixed(1)}%`, caption: 'active ÷ total', delta: 0.4, tone: 'positive' },
            ]}
          />
        ),
      },
      {
        id: 'revenue-trend',
        kicker: '02 · Revenue trend',
        title: 'Daily revenue · 12-month window',
        bigNumber: '',
        sentence: 'Ramadan 2026 is shaded in gold. Power BI flags Ramadan as a Gregorian anomaly — we shade it instead.',
        why: demoCaption ?? 'Source: transactions · Ramadan 2026: Feb 17 → Mar 18',
        actionLabel: 'Open revenue trend',
        actionHref: '/overview#revenue-trend',
        tone: 'neutral' as const,
        heroless: true,
        extra: (
          <div className="grid gap-3">
            <MiniAreaChart
              data={fullSeries.length ? fullSeries : sparkSeries}
              height={220}
              label="Daily revenue"
              valueFormat={(v) => formatAEDCompact(v)}
            />
            <MiniKpiStrip
              tiles={[
                { label: 'Best day', value: formatAEDCompact(bestDay || 96_000), caption: 'peak', tone: 'positive' },
                { label: 'Avg day', value: formatAEDCompact(avgDay || 42_000), caption: 'mean', tone: 'navy' },
                { label: 'Window total', value: formatAEDCompact(windowRevenue || 12_400_000), caption: 'sum', tone: 'gold' },
              ]}
            />
          </div>
        ),
      },
      {
        id: 'category-mix',
        kicker: '03 · Category mix',
        title: 'Where the revenue lands',
        bigNumber: topCategory,
        bigSubtext: 'top category',
        deltaText: `${mixRows[0] ? mixRows[0].share_pct.toFixed(1) : '32.0'}% share`,
        sentence: 'Groceries and Fresh drive two-thirds of revenue. Jewellery partners break generic RFM — treat them with value-weighted scoring.',
        why: demoCaption ?? 'Source: transactions × SKU catalogue',
        actionLabel: 'Open category mix',
        actionHref: '/overview#category-mix',
        tone: 'neutral' as const,
        extra: (
          <MiniBarChart
            data={categoryBars}
            label="Top 6 categories · AED"
            valueFormat={(v) => formatAEDCompact(v)}
            height={240}
          />
        ),
      },
      {
        id: 'stores',
        kicker: '04 · Store performance',
        title: 'Which stores pulled ahead',
        bigNumber: topStore,
        bigSubtext: 'lead store',
        deltaText: `${formatAEDCompact(storeRows[0]?.revenue ?? 0)} revenue`,
        sentence: 'Top 3 Acme Retail branches carry the coalition. Bottom stores drag average basket size — coach-out plan pending.',
        why: demoCaption ?? 'Source: transactions · grouped by store_id',
        actionLabel: 'Open store ranking',
        actionHref: '/stores',
        tone: 'positive' as const,
        extra: (
          <MiniTable<StorePerfItem>
            columns={[
              { key: 'store', label: 'Store', render: (r) => r.store },
              { key: 'rev', label: 'Revenue', align: 'right', render: (r) => formatAEDCompact(r.revenue) },
              { key: 'txns', label: 'Txns', align: 'right', render: (r) => formatCompact(r.transactions) },
              { key: 'avg', label: 'Avg basket', align: 'right', render: (r) => formatAED(r.avg_basket) },
            ]}
            rows={storeRows}
            footer="Top 6 of 55 Acme Retail UAE stores"
          />
        ),
      },
      {
        id: 'tiers',
        kicker: '05 · Tier distribution',
        title: 'Coalition membership shape',
        bigNumber: formatCompact(totalTierMembers || 996_000),
        bigSubtext: 'members',
        deltaText: `${platinumShare.toFixed(1)}% Platinum · ${goldShare.toFixed(1)}% Gold`,
        sentence: 'Nexus has no membership tiers today — this RFM-proposed ladder is the consulting deliverable on top of reporting.',
        why: demoCaption ?? 'Source: RFM clustering · KMeans · silhouette 0.42',
        actionLabel: 'Open tier-migration view',
        actionHref: '/tier-migration',
        tone: 'neutral' as const,
        extra: (
          <BlockRow
            ratio="1fr_1fr"
            left={
              <MiniDonut
                data={tierDonut}
                centerLabel={formatCompact(totalTierMembers || 996_000)}
                valueFormat={(v) => formatCompact(v)}
                height={220}
              />
            }
            right={
              <MiniKpiStrip
                tiles={[
                  { label: 'Platinum', value: `${platinumShare.toFixed(1)}%`, caption: formatCompact(tierRows.find((t) => t.tier === 'Platinum')?.members ?? 0), tone: 'navy' },
                  { label: 'Gold', value: `${goldShare.toFixed(1)}%`, caption: formatCompact(tierRows.find((t) => t.tier === 'Gold')?.members ?? 0), tone: 'gold' },
                  { label: 'Silver', value: `${silverShare.toFixed(1)}%`, caption: formatCompact(tierRows.find((t) => t.tier === 'Silver')?.members ?? 0), tone: 'navy' },
                  { label: 'Bronze', value: `${bronzeShare.toFixed(1)}%`, caption: formatCompact(tierRows.find((t) => t.tier === 'Bronze')?.members ?? 0), tone: 'warning' },
                ]}
              />
            }
          />
        ),
      },
      {
        id: 'top-skus',
        kicker: '06 · Top products',
        title: 'Highest-grossing SKUs this window',
        bigNumber: topProduct,
        bigSubtext: 'lead SKU',
        deltaText: `${formatAEDCompact(productRows[0]?.revenue ?? 0)} revenue`,
        sentence: 'Grocery basics dominate. Ramadan-adjacent SKUs (rice, oil, dates) will climb as the window approaches.',
        why: demoCaption ?? 'Source: transactions × product_dim · top 6 by revenue',
        actionLabel: 'Open top products',
        actionHref: '/overview#top-products',
        tone: 'neutral' as const,
        extra: (
          <MiniTable<TopProductItem>
            columns={[
              { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-[11px]">{r.sku_id}</span> },
              { key: 'name', label: 'Product', render: (r) => r.product_name },
              { key: 'brand', label: 'Brand', render: (r) => r.brand },
              { key: 'rev', label: 'Revenue', align: 'right', render: (r) => formatAEDCompact(r.revenue) },
              { key: 'units', label: 'Units', align: 'right', render: (r) => formatCompact(r.units) },
            ]}
            rows={productRows}
            footer="Top 6 of full SKU ranking"
          />
        ),
      },
      {
        id: 'insights',
        kicker: '07 · Actionable insights',
        title: 'What to do this week',
        bigNumber: '',
        sentence: 'Each insight maps to a drill-through on the Ops dashboard. Priority badge reflects loss-aversion weighting.',
        why: demoCaption ?? 'Source: rule-based + anomaly detection · daily refresh',
        actionLabel: 'Open insights',
        actionHref: '/alerts',
        tone: 'warning' as const,
        heroless: true,
        extra: (
          <MiniTable<InsightRow>
            columns={[
              {
                key: 'priority',
                label: 'Priority',
                width: 'w-28',
                render: (r) => (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${PRIORITY_BADGE[r.priority]}`}
                  >
                    {r.priority}
                  </span>
                ),
              },
              { key: 'title', label: 'Insight', render: (r) => <span className="font-medium text-foreground">{r.title}</span> },
              { key: 'text', label: 'Detail', render: (r) => <span className="text-[12px] text-muted-foreground">{r.text}</span> },
              {
                key: 'tone',
                label: 'Tone',
                align: 'right',
                width: 'w-24',
                render: (r) => (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {PRIORITY_TO_TONE[r.priority]}
                  </span>
                ),
              },
            ]}
            rows={insightList.slice(0, 6)}
            footer={insights ? 'Auto-generated from warehouse anomalies' : 'Demo data · wire-up in Phase 2'}
          />
        ),
      },
    ];
  }, [kpi, trend, categoryMix, stores, tiers, topProducts, insights]);

  return <ExecDeck cards={cards} label="Ops briefing" exitHref="/" topSlot={topSlot} />;
}
