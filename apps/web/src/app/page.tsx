'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { KpiGrid, KpiTile } from '@/components/kpi/kpi-tile';
import { FiltersBar, parseFilters } from '@/components/shell/filters-bar';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatAED, formatCompact, formatInt } from '@/lib/format';
import type { KpiTile as KpiTileT } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────
// Boardroom › Executive — single-screen exec summary inside the Nexus
// brand chrome. Per Arjit's coaching call (2026-04-26): keep the navy
// header, gold accents, sidebar, and footer; trim content to KPI strip,
// TY-vs-LY revenue, top 5 partners, top 10 stores. Pro 30-page suite at
// /executive is one click away in the sidebar (Boardroom mode trims the
// sidebar to 4 items but the AppShell brand chrome is unchanged).
// ─────────────────────────────────────────────────────────────────────────

export default function ExecutivePage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <ExecutiveContent />
    </Suspense>
  );
}

function ExecutiveContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const kpiQ = useQuery({
    queryKey: ['exec-home-kpi', filters],
    queryFn: () => api.kpi(filters),
  });
  const trendQ = useQuery({
    queryKey: ['exec-home-trend', filters],
    queryFn: () => api.revenueTrend(filters),
  });
  const partnersQ = useQuery({
    queryKey: ['exec-home-partners', filters],
    queryFn: () => api.cooPartners(filters),
  });
  const storesQ = useQuery({
    queryKey: ['exec-home-stores', filters],
    queryFn: () => api.storePerformance(filters),
  });

  const allTiles = kpiQ.data?.tiles ?? [];
  // Top strip — 4 headline tiles from the API (Total Revenue, Transactions,
  // Active Members, Avg Basket = ATV).
  const tiles = allTiles.slice(0, 4);
  const placeholders = Array.from({ length: 4 });

  // Second strip — 4 derived loyalty / coalition KPIs that Indian-origin CXOs
  // ask for in retail loyalty: ATV, AMS, TPP, Points Redemption Rate.
  const revenueT = allTiles.find((t) => t.id === 'revenue');
  const txnT = allTiles.find((t) => t.id === 'transactions');
  const memberT = allTiles.find((t) => t.id === 'active_members');
  const basketT = allTiles.find((t) => t.id === 'avg_basket');
  const earnedT = allTiles.find((t) => t.id === 'points_earned');
  const redeemedT = allTiles.find((t) => t.id === 'points_redeemed');
  const unitsPerTxnT = allTiles.find((t) => t.id === 'avg_units_per_txn');

  const revenueVal = revenueT?.value ?? 0;
  const txnVal = txnT?.value ?? 0;
  const memberVal = memberT?.value ?? 0;
  const basketVal = basketT?.value ?? 0;
  const earnedVal = earnedT?.value ?? 0;
  const redeemedVal = redeemedT?.value ?? 0;
  const unitsPerTxnVal = unitsPerTxnT?.value ?? 0;

  const atv = basketVal; // Average Transaction Value
  const ams = memberVal > 0 ? revenueVal / memberVal : 0; // Avg Member Spend
  const tpp = memberVal > 0 ? txnVal / memberVal : 0; // Trips Per Patron
  const redemptionRate = earnedVal > 0 ? (redeemedVal / earnedVal) * 100 : 0;
  const upt = unitsPerTxnVal; // Units per transaction

  const derivedTiles: KpiTileT[] = [
    {
      id: 'atv',
      label: 'ATV — Avg Transaction',
      value: atv,
      value_display: formatAED(atv),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: atv >= 250 ? 'positive' : 'neutral',
    },
    {
      id: 'ams',
      label: 'AMS — Avg Member Spend',
      value: ams,
      value_display: formatAED(ams),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'positive',
    },
    {
      id: 'tpp',
      label: 'TPP — Trips Per Patron',
      value: tpp,
      value_display: tpp.toFixed(1),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: tpp >= 5 ? 'positive' : 'neutral',
    },
    {
      id: 'upt',
      label: 'UPT — Units / Txn',
      value: upt,
      value_display: upt.toFixed(1),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
  ];

  const derivedTiles2: KpiTileT[] = [
    {
      id: 'redemption_rate',
      label: 'Redemption Rate',
      value: redemptionRate,
      value_display: `${redemptionRate.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment:
        redemptionRate >= 40
          ? 'positive'
          : redemptionRate <= 10
            ? 'negative'
            : 'neutral',
    },
    {
      id: 'pts_earned',
      label: 'Points Earned',
      value: earnedVal,
      value_display: formatCompact(earnedVal),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'pts_redeemed',
      label: 'Points Redeemed',
      value: redeemedVal,
      value_display: formatCompact(redeemedVal),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'liability',
      label: 'Outstanding Liability',
      value: earnedVal - redeemedVal,
      value_display: formatCompact(earnedVal - redeemedVal),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
  ];

  const trendData = (trendQ.data?.series ?? []).slice(-12).map((p) => ({
    label: new Date(p.date).toLocaleDateString('en-AE', { month: 'short' }),
    ty: p.revenue,
    ly: Math.round(p.revenue * 0.88),
  }));

  const top5Partners = (partnersQ.data?.partners ?? [])
    .slice()
    .sort((a, b) => b.txns_window - a.txns_window)
    .slice(0, 5);
  const totalTxns =
    top5Partners.reduce((s, p) => s + p.txns_window, 0) || 1;

  const top10Stores = (storesQ.data ?? [])
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Executive Summary
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coalition KPIs · partner mix · store performance — at a glance.
          </p>
        </div>
        <Badge variant="outline">
          {kpiQ.data?.period_label ?? 'Live · all-time window'}
        </Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="kpi-heading" className="space-y-3">
        <header>
          <h2
            id="kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            This window at a glance
          </h2>
          <p className="text-sm text-muted-foreground">
            Four headline numbers · sparklines = last 14 days.
          </p>
        </header>
        <KpiGrid>
          {(kpiQ.isLoading ? placeholders : tiles).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as (typeof tiles)[number] | undefined}
              loading={kpiQ.isLoading}
            />
          ))}
        </KpiGrid>

        {/* Second strip — derived loyalty / per-transaction KPIs */}
        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Per-transaction & per-member
          </h2>
          <p className="text-sm text-muted-foreground">
            ATV · AMS · TPP · UPT — the four ratios CXOs ask for in every
            board pack.
          </p>
        </header>
        <KpiGrid>
          {(kpiQ.isLoading ? placeholders : derivedTiles).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={kpiQ.isLoading}
            />
          ))}
        </KpiGrid>

        {/* Third strip — points & liability */}
        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Points & liability
          </h2>
          <p className="text-sm text-muted-foreground">
            Earned · redeemed · redemption rate · outstanding liability on the
            balance sheet.
          </p>
        </header>
        <KpiGrid>
          {(kpiQ.isLoading ? placeholders : derivedTiles2).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={kpiQ.isLoading}
            />
          ))}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend — TY vs LY</CardTitle>
            <CardDescription>
              This year vs last year (synthetic LY at −12% baseline) — last
              12 months.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              {trendData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trendData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#E8E5DC" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #E8E5DC',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, name: string) => [
                        formatAED(v),
                        name === 'ty' ? 'This Year' : 'Last Year',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="ly"
                      stroke="#9CA3AF"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ty"
                      stroke="#0F1120"
                      strokeWidth={2.25}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Partners</CardTitle>
            <CardDescription>
              Share of transactions across the coalition.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-3 pt-1">
              {top5Partners.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading partners…
                </div>
              ) : (
                top5Partners.map((p, i) => {
                  const pct = (p.txns_window / totalTxns) * 100;
                  return (
                    <div
                      key={p.name}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className="w-5 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}.
                      </div>
                      <div className="w-32 truncate font-medium text-foreground">
                        {p.name}
                      </div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full bg-[#F9C349]"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <div className="w-14 text-right font-mono text-xs font-semibold text-foreground">
                        {pct.toFixed(1)}%
                      </div>
                      <div className="w-16 text-right font-mono text-xs text-muted-foreground">
                        {formatInt(p.txns_window)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Stores by Revenue</CardTitle>
          <CardDescription>
            Active filter window · drill into Pro view (Stores) for SHAP +
            penetration.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">Store</th>
                  <th className="px-5 py-2 text-right">Transactions</th>
                  <th className="px-5 py-2 text-right">Revenue</th>
                  <th className="px-5 py-2 text-right">Avg Basket</th>
                </tr>
              </thead>
              <tbody>
                {top10Stores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading store performance…
                    </td>
                  </tr>
                ) : (
                  top10Stores.map((s, i) => (
                    <tr
                      key={s.store}
                      className={i % 2 === 1 ? 'bg-muted/30' : ''}
                    >
                      <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-5 py-2 font-medium text-foreground">
                        {s.store}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {formatInt(s.transactions)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                        {formatAED(s.revenue)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {formatAED(s.avg_basket, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
