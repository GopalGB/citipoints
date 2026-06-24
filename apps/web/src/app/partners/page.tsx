'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';

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
import { formatInt } from '@/lib/format';
import type { KpiTile as KpiTileT } from '@/lib/types';

const HEALTH_COLOR: Record<'green' | 'amber' | 'red', string> = {
  green: '#22A37A',
  amber: '#DA9712',
  red: '#DC2626',
};

const HEALTH_LABEL: Record<'green' | 'amber' | 'red', string> = {
  green: 'Healthy',
  amber: 'Watch',
  red: 'Action',
};

export default function PartnersPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <PartnersContent />
    </Suspense>
  );
}

function PartnersContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const partnersQ = useQuery({
    queryKey: ['partners-list', filters],
    queryFn: () => api.cooPartners(filters),
  });

  const partners = (partnersQ.data?.partners ?? [])
    .slice()
    .sort((a, b) => b.txns_window - a.txns_window);

  const top10 = partners.slice(0, 10);
  const totalTopTxns = top10.reduce((s, p) => s + p.txns_window, 0) || 1;

  const partnerCount = partners.length;
  const avgEarn =
    partners.length > 0
      ? partners.reduce((s, p) => s + p.earn_index, 0) / partners.length
      : 0;
  const avgRedeem =
    partners.length > 0
      ? partners.reduce((s, p) => s + p.redemption_index, 0) /
        partners.length
      : 0;
  const avgSla =
    partners.length > 0
      ? partners.reduce((s, p) => s + p.sla_pct, 0) / partners.length
      : 0;

  const healthCounts: Record<'green' | 'amber' | 'red', number> = {
    green: 0,
    amber: 0,
    red: 0,
  };
  for (const p of partners) healthCounts[p.health] += 1;

  const hhi = partnersQ.data?.hhi ?? 0;

  // KPI tiles built from the partners endpoint
  const tiles: KpiTileT[] = [
    {
      id: 'partner_count',
      label: 'Active Partners',
      value: partnerCount,
      value_display: formatInt(partnerCount),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_earn',
      label: 'Avg Earn Index',
      value: avgEarn,
      value_display: avgEarn.toFixed(2),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_redeem',
      label: 'Avg Redeem Index',
      value: avgRedeem,
      value_display: avgRedeem.toFixed(2),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_sla',
      label: 'Avg SLA',
      value: avgSla,
      value_display: `${avgSla.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: avgSla >= 95 ? 'positive' : avgSla >= 90 ? 'neutral' : 'negative',
    },
  ];

  // Second strip — concentration & health-distribution KPIs
  const topPartner = partners[0];
  const topShare =
    topPartner
      ? (topPartner.txns_window /
          (partners.reduce((s, p) => s + p.txns_window, 0) || 1)) *
        100
      : 0;
  const totalTxnsAll = partners.reduce((s, p) => s + p.txns_window, 0);
  const top3Share =
    partners.length > 0
      ? (partners.slice(0, 3).reduce((s, p) => s + p.txns_window, 0) /
          (totalTxnsAll || 1)) *
        100
      : 0;
  const greenPct =
    partnerCount > 0 ? (healthCounts.green / partnerCount) * 100 : 0;
  const redPct =
    partnerCount > 0 ? (healthCounts.red / partnerCount) * 100 : 0;

  const tilesRow2: KpiTileT[] = [
    {
      id: 'top_share',
      label: topPartner ? `${topPartner.name} Share` : 'Top Partner',
      value: topShare,
      value_display: `${topShare.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: topShare > 30 ? 'negative' : 'neutral',
    },
    {
      id: 'top3_share',
      label: 'Top-3 Share',
      value: top3Share,
      value_display: `${top3Share.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: top3Share > 60 ? 'negative' : 'neutral',
    },
    {
      id: 'green_pct',
      label: 'Healthy %',
      value: greenPct,
      value_display: `${greenPct.toFixed(0)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: greenPct >= 70 ? 'positive' : greenPct < 50 ? 'negative' : 'neutral',
    },
    {
      id: 'red_pct',
      label: 'Action-needed %',
      value: redPct,
      value_display: `${redPct.toFixed(0)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: redPct > 15 ? 'negative' : 'neutral',
    },
  ];

  const concentrationLabel =
    hhi < 1500
      ? 'Coalition is well-distributed'
      : hhi < 2500
        ? 'Moderate concentration — anchor-partner skew'
        : 'High concentration — single-partner risk';

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Partners — Coalition view
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Partner contribution, health, SLA, earn/redeem efficiency.
          </p>
        </div>
        <Badge variant="outline">
          HHI {hhi > 0 ? hhi.toFixed(0) : '—'} · {concentrationLabel}
        </Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="partners-kpi-heading" className="space-y-3">
        <header>
          <h2
            id="partners-kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Coalition KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            {healthCounts.green} healthy · {healthCounts.amber} watch ·{' '}
            {healthCounts.red} action
          </p>
        </header>
        <KpiGrid>
          {(partnersQ.isLoading ? Array.from({ length: 4 }) : tiles).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={partnersQ.isLoading}
              />
            ),
          )}
        </KpiGrid>

        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Concentration & coalition health
          </h2>
          <p className="text-sm text-muted-foreground">
            Top-partner skew and overall partner-health distribution.
          </p>
        </header>
        <KpiGrid>
          {(partnersQ.isLoading ? Array.from({ length: 4 }) : tilesRow2).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={partnersQ.isLoading}
              />
            ),
          )}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Partners by Transactions</CardTitle>
            <CardDescription>
              Share of activity across the coalition.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pt-1 pr-1">
              {top10.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading partners…
                </div>
              ) : (
                top10.map((p, i) => {
                  const pct = (p.txns_window / totalTopTxns) * 100;
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

        <Card>
          <CardHeader>
            <CardTitle>Partner Health</CardTitle>
            <CardDescription>
              Coalition-wide health distribution. Green = on-target, Amber =
              watch, Red = action.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-3 pt-1">
              {partnerCount === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                (['green', 'amber', 'red'] as const).map((h) => {
                  const count = healthCounts[h];
                  const pct = (count / partnerCount) * 100;
                  return (
                    <div
                      key={h}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className="w-20 truncate font-medium text-foreground">
                        {HEALTH_LABEL[h]}
                      </div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            background: HEALTH_COLOR[h],
                          }}
                        />
                      </div>
                      <div className="w-16 text-right font-mono text-xs font-semibold text-foreground">
                        {count}
                      </div>
                      <div className="w-14 text-right font-mono text-xs text-muted-foreground">
                        {pct.toFixed(0)}%
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
          <CardTitle>All Partners — performance</CardTitle>
          <CardDescription>
            Full coalition table — txns, earn, redemption, SLA, health.
            Drill into Pro view (Coalition flow) for the Sankey.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">Partner</th>
                  <th className="px-5 py-2 text-right">Transactions</th>
                  <th className="px-5 py-2 text-right">Earn Idx</th>
                  <th className="px-5 py-2 text-right">Redeem Idx</th>
                  <th className="px-5 py-2 text-right">SLA</th>
                  <th className="px-5 py-2">Health</th>
                </tr>
              </thead>
              <tbody>
                {partners.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading partners…
                    </td>
                  </tr>
                ) : (
                  partners.map((p, i) => (
                    <tr
                      key={p.name}
                      className={i % 2 === 1 ? 'bg-muted/30' : ''}
                    >
                      <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-5 py-2 font-medium text-foreground">
                        {p.name}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {formatInt(p.txns_window)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {p.earn_index.toFixed(2)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {p.redemption_index.toFixed(2)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {p.sla_pct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: HEALTH_COLOR[p.health] }}
                        />
                        <span className="ml-2 align-middle text-foreground">
                          {HEALTH_LABEL[p.health]}
                        </span>
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
