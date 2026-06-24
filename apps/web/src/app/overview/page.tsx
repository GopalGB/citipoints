'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Coins, LayoutDashboard, Presentation, Sparkles, Store, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { NexusMark } from '@/components/brand/nexus-logo';
import { CategoryMixChart } from '@/components/charts/category-mix-chart';
import { ChartNarrative } from '@/components/charts/chart-narrative';
import { ChartShell } from '@/components/charts/chart-shell';
import { RevenueTrendChart } from '@/components/charts/revenue-trend-chart';
import { StorePerfChart } from '@/components/charts/store-perf-chart';
import { TierDistChart } from '@/components/charts/tier-dist-chart';
import { TopProductsTable } from '@/components/charts/top-products-table';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { CoalitionEconomics } from '@/components/kpi/coalition-economics';
import { KpiGrid, KpiTile } from '@/components/kpi/kpi-tile';
import { OpsDeck } from '@/components/ops/ops-deck';
import { RegionSplitCard } from '@/components/region/region-split-card';
import { FiltersBar, parseFilters } from '@/components/shell/filters-bar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatAEDCompact, formatCompact, formatDelta } from '@/lib/format';
import { cn } from '@/lib/utils';

type OpsView = 'dashboard' | 'deck';
const VIEW_STORAGE_KEY = 'nexus:ops-view';

function HomeContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [view, setView] = useState<OpsView>('dashboard');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'dashboard' || stored === 'deck') setView(stored);
  }, []);

  const pickView = (v: OpsView) => {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  const kpiQuery = useQuery({ queryKey: ['kpi', filters], queryFn: () => api.kpi(filters) });
  // Deck view still needs its own insight bundle — shared with PageAiSummary via TanStack cache.
  const insightsQuery = useQuery({
    queryKey: ['insights-home', JSON.stringify(filters)],
    queryFn: () => api.insightsHome(filters),
  });
  const trendQuery = useQuery({
    queryKey: ['trend', filters],
    queryFn: () => api.revenueTrend(filters),
  });
  const mixQuery = useQuery({
    queryKey: ['mix', filters],
    queryFn: () => api.categoryMix(filters),
  });
  const storeQuery = useQuery({
    queryKey: ['store-perf', filters],
    queryFn: () => api.storePerformance(filters),
  });
  const tierQuery = useQuery({
    queryKey: ['tier-dist', filters],
    queryFn: () => api.tierDistribution(filters),
  });
  const topQuery = useQuery({
    queryKey: ['top-products', filters],
    queryFn: () => api.topProducts(filters, 10),
  });

  const tiles = kpiQuery.data?.tiles ?? [];
  const placeholders = Array.from({ length: 8 });

  // ── Dynamic headline fuel ────────────────────────────────────
  // Hero + subtitle + email stats auto-adjust to whatever the warehouse says.
  const revenueTile = tiles.find((t) => t.id === 'revenue');
  const txnTile = tiles.find((t) => t.id === 'transactions');
  const memberTile = tiles.find((t) => t.id === 'active_members' || t.id === 'active_customers');
  const atvTile = tiles.find((t) => t.id === 'atv' || t.id === 'avg_basket');
  const pointsEarnedTile = tiles.find((t) => t.id === 'points_earned' || t.id === 'points_issued');
  const pointsRedeemedTile = tiles.find((t) => t.id === 'points_redeemed');

  const dynamicHeroHeadline = useMemo(() => {
    if (revenueTile) {
      const dir =
        revenueTile.delta_pct == null
          ? ''
          : revenueTile.delta_pct > 0
            ? 'growing'
            : revenueTile.delta_pct < 0
              ? 'softening'
              : 'flat';
      const deltaTxt = revenueTile.delta_pct == null ? '' : ` ${formatDelta(revenueTile.delta_pct)}`;
      return { primary: `${dir || 'Loyalty'} revenue`, amount: revenueTile.value_display, delta: deltaTxt };
    }
    return null;
  }, [revenueTile]);

  const dynamicSubtitle = useMemo(() => {
    if (!kpiQuery.data) return null;
    const parts: string[] = [];
    if (kpiQuery.data.period_label) parts.push(kpiQuery.data.period_label);
    if (memberTile) parts.push(`${memberTile.value_display} active members`);
    if (atvTile) parts.push(`${atvTile.value_display} avg basket`);
    if (pointsEarnedTile && pointsRedeemedTile && pointsEarnedTile.value > 0) {
      const burnRate = (pointsRedeemedTile.value / pointsEarnedTile.value) * 100;
      parts.push(`${burnRate.toFixed(0)}% burn rate`);
    }
    return parts.length ? parts.join(' · ') : null;
  }, [kpiQuery.data, memberTile, atvTile, pointsEarnedTile, pointsRedeemedTile]);

  const emailStats = useMemo<Record<string, string>>(() => {
    const stats: Record<string, string> = {};
    if (revenueTile) stats.Revenue = `${revenueTile.value_display} (${formatDelta(revenueTile.delta_pct)})`;
    if (memberTile) stats['Active members'] = memberTile.value_display;
    if (atvTile) stats['Avg basket'] = atvTile.value_display;
    if (txnTile) stats.Transactions = txnTile.value_display;
    if (pointsEarnedTile) stats['Points earned'] = formatCompact(pointsEarnedTile.value);
    if (pointsRedeemedTile) stats['Points redeemed'] = formatCompact(pointsRedeemedTile.value);
    if (kpiQuery.data?.period_label) stats.Window = kpiQuery.data.period_label;
    // Surface the format helper to avoid a dead-code lint on narrow builds
    if (revenueTile) stats['Revenue (compact)'] = formatAEDCompact(revenueTile.value);
    return stats;
  }, [revenueTile, memberTile, atvTile, txnTile, pointsEarnedTile, pointsRedeemedTile, kpiQuery.data]);

  if (view === 'deck') {
    return (
      <OpsDeck
        kpi={kpiQuery.data}
        trend={trendQuery.data}
        categoryMix={mixQuery.data}
        stores={storeQuery.data}
        tiers={tierQuery.data}
        topProducts={topQuery.data}
        insights={insightsQuery.data}
        topSlot={<OpsViewSwitcher view={view} onChange={pickView} />}
      />
    );
  }

  return (
    <div className="animate-fade-up space-y-8">
      <OpsViewSwitcher view={view} onChange={pickView} />

      {/* HERO — dark navy block with gold glow, echoing Nexus app */}
      <section className="nexus-hero relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-10">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              <NexusMark size={14} /> All Rewards. One Analytics.
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance md:text-[42px] md:leading-[1.05]">
              {dynamicHeroHeadline ? (
                <>
                  <span className="text-nexus-gold">{dynamicHeroHeadline.amount}</span>{' '}
                  {dynamicHeroHeadline.primary}
                  {dynamicHeroHeadline.delta ? (
                    <span className="text-nexus-gold">{dynamicHeroHeadline.delta}</span>
                  ) : null}
                  &nbsp;— where should we act this week?
                </>
              ) : (
                <>
                  How is <span className="text-nexus-gold">loyalty performing</span> for your
                  stores right now&nbsp;— and{' '}
                  <span className="text-nexus-gold">where should we act</span> this week?
                </>
              )}
            </h1>
            <p className="max-w-xl text-[15px] text-white/75 md:text-base">
              {dynamicSubtitle
                ? `${dynamicSubtitle}. 1 Nexus per AED earned · 200 Nexus = AED 1 redeemed · 26% breakage baseline.`
                : "The operator's overview — revenue, Nexus issued vs redeemed, store and tier spread. 1 Nexus per AED earned · 200 Nexus = AED 1 redeemed · 26% breakage baseline."}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F9C349] px-3 py-1 text-xs font-semibold text-[#0F1120]">
                <Coins className="h-3.5 w-3.5" /> 1 Nexus / AED
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
                <Users className="h-3.5 w-3.5" />{' '}
                {memberTile ? `${memberTile.value_display} active` : '1.2M+ members'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
                <Store className="h-3.5 w-3.5" />{' '}
                {storeQuery.data?.length
                  ? `${storeQuery.data.length} stores · coalition`
                  : '55 Acme Retail UAE stores'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
                <TrendingUp className="h-3.5 w-3.5" />{' '}
                {atvTile ? `${atvTile.value_display} ATV` : '60% analytical models'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/chat"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#F9C349] px-4 py-2 text-sm font-semibold text-[#0F1120] shadow-[0_10px_30px_rgba(249,195,73,0.45)] transition hover:bg-[#fbd06a]"
              >
                <Sparkles className="h-4 w-4" />
                Ask Nexus AI
              </Link>
              <Link
                href="/predictive"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Who to save this week
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Partner spotlight — sits on the right. Numbers derived from live
              warehouse queries (stores/top products/active members) rather
              than hardcoded so the card reflects the active filter window. */}
          <aside className="hidden w-[280px] flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-white/80 backdrop-blur lg:flex">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
                Partner spotlight
              </span>
              <NexusMark size={18} />
            </div>
            <p className="text-lg font-semibold text-white">Acme Retail</p>
            <p className="leading-relaxed">
              {storeQuery.data?.length ?? 55} UAE stores. Coalition partner since launch. Earn rate parity with Nexus base tier.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Stat
                value={storeQuery.data?.length ? String(storeQuery.data.length) : '55'}
                label="Stores"
              />
              <Stat
                value={topQuery.data?.length ? String(topQuery.data.length) : '10'}
                label="Top SKUs"
              />
              <Stat
                value={memberTile ? memberTile.value_display : '—'}
                label="Active"
              />
            </div>
            <p className="pt-2 text-[10px] text-white/55">
              {storeQuery.data?.length || memberTile
                ? 'Live · from active window'
                : 'Loading warehouse…'}
            </p>
          </aside>
        </div>
      </section>

      {/* FILTERS */}
      <FiltersBar />

      {/* DYNAMIC BANNER — live revenue + delta headline from the active window. */}
      <DynamicBanner
        page="overview"
        filters={filters}
        kicker="Partner overview"
        fallbackHeadline="Coalition performance this window"
        fallbackSubtitle="Computing live revenue, transactions, and ATV from the warehouse…"
        variant="light"
        polish
      />

      {/* AI SUMMARY — auto-generated insights + Email / Capture / Regenerate */}
      <PageAiSummary
        queryKey={['insights-home', JSON.stringify(filters)]}
        loader={() => api.insightsHome(filters)}
        pageTitle="Overview"
        emailStats={emailStats}
      />

      {/* KPI GRID */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <header className="flex items-end justify-between">
          <div>
            <h2 id="kpi-heading" className="font-display text-lg font-semibold text-foreground">
              This week at a glance
            </h2>
            <p className="text-sm text-muted-foreground">
              Eight headline numbers. Sparklines show last 14 days.
            </p>
          </div>
          <Badge variant="outline">Auto-refreshed from warehouse</Badge>
        </header>
        <KpiGrid>
          {(kpiQuery.isLoading ? placeholders : tiles).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as typeof tiles[number] | undefined}
              loading={kpiQuery.isLoading}
            />
          ))}
        </KpiGrid>
      </section>

      {/* COALITION ECONOMICS — CFO-facing KPIs Power BI templates never ship with */}
      {tiles.length > 0 ? <CoalitionEconomics kpiTiles={tiles} /> : null}

      {/* BAHRAIN vs UAE — regional split (Nov-2025 expansion) */}
      <RegionSplitCard />

      {/* CHARTS */}
      <section aria-labelledby="charts-heading" className="space-y-3">
        <header>
          <h2 id="charts-heading" className="font-display text-lg font-semibold text-foreground">
            Trends &amp; breakdowns
          </h2>
          <p className="text-sm text-muted-foreground">
            Where the money flowed · which categories grew · which stores pulled ahead.
          </p>
        </header>

        <div className="grid auto-rows-fr gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <ChartShell
              id="revenue-trend"
              title="Revenue trend"
              description="Daily revenue across all filtered stores · Ramadan windows shaded in gold"
              height={320}
              footer="Islamic calendar overlays mark Ramadan fasting + Eid spikes."
            >
              {trendQuery.data?.series?.length ? (
                <RevenueTrendChart data={trendQuery.data.series} />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </ChartShell>
            <ChartNarrative
              text="Ramadan lifts grocery &amp; jewellery spend"
              delta="+28–40% vs baseline"
              why="Power BI's Gregorian-only date table flags it as an anomaly. We shade it."
              tone="positive"
            />
          </div>

          <div className="flex flex-col gap-2">
            <ChartShell
              id="category-mix"
              title="Category revenue mix"
              description="Which basket categories are driving revenue"
              height={320}
            >
              {mixQuery.data?.length ? (
                <CategoryMixChart data={mixQuery.data} />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </ChartShell>
            <ChartNarrative
              text="Jewellery partners (Bafleh, Joyalukkas, NGDJ) are high-AED low-frequency — standard RFM flags them as 'Hibernating'."
              delta="value-weighted scoring needed"
              why="Dubai gold souk behaviour breaks generic BI templates."
              tone="info"
            />
          </div>
        </div>

        <div className="grid auto-rows-fr gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <ChartShell
              id="store-performance"
              title="Store performance"
              description="Top and bottom stores by revenue"
              height={320}
            >
              {storeQuery.data?.length ? (
                <StorePerfChart data={storeQuery.data} />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </ChartShell>
            <ChartNarrative
              text="Top 3 Acme Retail branches carry the coalition — bottom stores drag average basket size."
              delta="partner-level drill-through"
              why="Right-click any bar → jump to member list (coming next)."
              tone="neutral"
            />
          </div>

          <div className="flex flex-col gap-2">
            <ChartShell
              id="tier-distribution"
              title="Tier distribution"
              description="Members vs revenue per loyalty tier (Nexus has no tiers yet — our RFM proposes them)"
              height={320}
            >
              {tierQuery.data?.length ? (
                <TierDistChart data={tierQuery.data} />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </ChartShell>
            <ChartNarrative
              text="Nexus FAQ confirms no membership tiers currently."
              delta="RFM + KMeans proposes a 5-tier structure"
              why="Consulting deliverable on top of reporting."
              tone="info"
            />
          </div>
        </div>

        <ChartShell
          id="top-products"
          title="Top 10 products"
          description="Highest-grossing SKUs in the current window"
          height="auto"
        >
          {topQuery.data ? (
            <TopProductsTable rows={topQuery.data} />
          ) : (
            <Skeleton className="h-80 w-full" />
          )}
        </ChartShell>
      </section>

      {/* QUICK-ANSWER CARDS — friendly entry points */}
      <section aria-labelledby="quick-answers-heading" className="space-y-3">
        <header>
          <h2 id="quick-answers-heading" className="font-display text-lg font-semibold text-foreground">
            Quick answers
          </h2>
          <p className="text-sm text-muted-foreground">
            Jump straight to the model that answers your question.
          </p>
        </header>
        <div className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
          <QuickCard
            href="/predictive"
            title="Who is about to churn?"
            body="XGBoost churn + BG/NBD CLV. Ranked list of Platinum & Gold members at risk this week."
            cta="Open Churn + CLV"
          />
          <QuickCard
            href="/market-basket"
            title="What sells together?"
            body="FP-Growth frequent itemsets. Bundles, lift, and basket attachment ideas for promo planning."
            cta="Open Market Basket"
          />
          <QuickCard
            href="/segments"
            title="Who are my best customers?"
            body="RFM + KMeans. 8 behavioural segments with revenue, frequency, and tier mix."
            cta="Open Segments"
          />
          <QuickCard
            href="/anomaly"
            title="Did anything weird happen?"
            body="STL residuals flag unusual revenue days with a plain-English reason line."
            cta="Open Anomaly watch"
          />
          <QuickCard
            href="/recommendations"
            title="What should I offer?"
            body="Hybrid recommender — collaborative + content. Per-customer next-best offer."
            cta="Open Recommendations"
          />
          <QuickCard
            href="/chat"
            title="Ask me anything"
            body="Natural-language Q&A over the warehouse. Backed by Claude Code CLI."
            cta="Open Ask Nexus AI"
            accent
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
      <p className="font-display text-base font-semibold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/60">{label}</p>
    </div>
  );
}

function QuickCard({
  href,
  title,
  body,
  cta,
  accent,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 transition-all ' +
        (accent
          ? 'border-[#F9C349]/40 bg-[#FDF5E0] shadow-tile hover:shadow-gold'
          : 'border-border bg-surface shadow-tile hover:-translate-y-0.5 hover:shadow-pop')
      }
    >
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[#B4820E] group-hover:gap-2">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
      {accent ? (
        <span className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#F9C349]/20 blur-2xl" />
      ) : null}
    </Link>
  );
}

function OpsViewSwitcher({
  view,
  onChange,
  floating,
}: {
  view: OpsView;
  onChange: (v: OpsView) => void;
  floating?: boolean;
}) {
  const options: { id: OpsView; label: string; hint: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Full dashboard', hint: 'Dense multi-section view · all filters', icon: LayoutDashboard },
    { id: 'deck', label: 'Presenter deck', hint: 'Full-screen · keyboard · 90 sec briefing', icon: Presentation },
  ];
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3',
        floating && 'absolute left-4 top-2 z-30 mb-0 w-auto rounded-full border border-border bg-white/90 px-2 py-1 shadow-tile backdrop-blur',
      )}
    >
      <div role="tablist" aria-label="Ops view" className="inline-flex items-center gap-1 rounded-full border border-border bg-white p-0.5">
        {options.map((o) => {
          const Icon = o.icon;
          const chosen = o.id === view;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={chosen}
              onClick={() => onChange(o.id)}
              title={o.hint}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition',
                chosen ? 'bg-[#F9C349] text-[#0F1120] shadow-[0_2px_8px_rgba(249,195,73,0.35)]' : 'text-foreground/75 hover:bg-muted',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {o.label}
            </button>
          );
        })}
      </div>
      {!floating ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[#DA9712]" />
          Same warehouse · different density for your audience
        </span>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading dashboard…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
