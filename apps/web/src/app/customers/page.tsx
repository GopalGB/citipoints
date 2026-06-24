'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

const TIER_COLORS: Record<string, string> = {
  Platinum: '#0F1120',
  Gold: '#DA9712',
  Silver: '#7B8A8E',
  Bronze: '#A65A2C',
};

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <CustomersContent />
    </Suspense>
  );
}

function CustomersContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const kpiQ = useQuery({
    queryKey: ['cust-kpi', filters],
    queryFn: () => api.kpi(filters),
  });
  const tiersQ = useQuery({
    queryKey: ['cust-tiers', filters],
    queryFn: () => api.tierDistribution(filters),
  });
  const cohortQ = useQuery({
    queryKey: ['cust-cohort'],
    queryFn: () => api.cohort(),
  });
  const clvQ = useQuery({
    queryKey: ['cust-clv'],
    queryFn: () => api.clv(20),
  });
  const churnQ = useQuery({
    queryKey: ['cust-churn'],
    queryFn: () => api.churn(50),
  });

  const tiers = (tiersQ.data ?? []).slice().sort((a, b) => b.members - a.members);
  const totalMembers = tiers.reduce((s, t) => s + t.members, 0) || 1;

  const cohortByMonth = new Map<string, number>();
  for (const c of cohortQ.data ?? []) {
    const cur = cohortByMonth.get(c.cohort_month) ?? 0;
    cohortByMonth.set(c.cohort_month, cur + c.active_count);
  }
  const growthSeries = Array.from(cohortByMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-12)
    .map(([month, count]) => ({
      label: new Date(month + '-01').toLocaleDateString('en-AE', {
        month: 'short',
      }),
      members: count,
    }));

  const topClv = (clvQ.data?.predictions ?? [])
    .slice()
    .sort((a, b) => b.predicted_clv_12m - a.predicted_clv_12m)
    .slice(0, 10);

  // Pull customer-relevant tiles from the global KPI bundle. Keep first
  // member tile + revenue, augment with synthetic Churn-Rate and Avg-CLV
  // tiles built from the predictive endpoints above.
  const allTiles = kpiQ.data?.tiles ?? [];
  const memberTile = allTiles.find(
    (t) => t.id === 'active_members' || t.id === 'active_customers',
  );
  const revenueTile = allTiles.find((t) => t.id === 'revenue');

  const churnRate = (churnQ.data?.metrics.churn_rate ?? 0) * 100;
  const avgClv =
    (clvQ.data?.predictions ?? []).length > 0
      ? clvQ.data!.predictions.reduce(
          (s, p) => s + p.predicted_clv_12m,
          0,
        ) / clvQ.data!.predictions.length
      : 0;

  const churnTile: KpiTileT = {
    id: 'churn_rate',
    label: 'Churn Rate',
    value: churnRate,
    value_display: `${churnRate.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: churnRate > 10 ? 'negative' : 'neutral',
  };

  const clvTile: KpiTileT = {
    id: 'avg_clv',
    label: 'Avg 12-mo CLV',
    value: avgClv,
    value_display: avgClv > 0 ? formatAED(avgClv) : '—',
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: 'positive',
  };

  // Second strip — Platinum %, Gold %, retention 30d proxy, top-tier rev share.
  const platinumCount = tiers.find((t) => t.tier === 'Platinum')?.members ?? 0;
  const goldCount = tiers.find((t) => t.tier === 'Gold')?.members ?? 0;
  const platinumPct = totalMembers > 0 ? (platinumCount / totalMembers) * 100 : 0;
  const goldPct = totalMembers > 0 ? (goldCount / totalMembers) * 100 : 0;
  const platinumRev = tiers.find((t) => t.tier === 'Platinum')?.revenue ?? 0;
  const totalTierRev = tiers.reduce((s, t) => s + t.revenue, 0) || 1;
  const platinumRevShare = (platinumRev / totalTierRev) * 100;
  const retainedCount = (churnQ.data?.high_risk_sample ?? []).filter((c) => c.churn_probability < 0.3).length;
  const churnPool = (churnQ.data?.high_risk_sample ?? []).length || 1;
  const retentionPct = (retainedCount / churnPool) * 100;

  const platinumTile: KpiTileT = {
    id: 'platinum_share',
    label: 'Platinum Share',
    value: platinumPct,
    value_display: `${platinumPct.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: 'positive',
  };
  const goldTile: KpiTileT = {
    id: 'gold_share',
    label: 'Gold Share',
    value: goldPct,
    value_display: `${goldPct.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: 'neutral',
  };
  const platinumRevTile: KpiTileT = {
    id: 'platinum_rev_share',
    label: 'Platinum Rev Share',
    value: platinumRevShare,
    value_display: `${platinumRevShare.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: platinumRevShare >= 30 ? 'positive' : 'neutral',
  };
  const retentionTile: KpiTileT = {
    id: 'retention',
    label: 'Retention (low-churn)',
    value: retentionPct,
    value_display: `${retentionPct.toFixed(0)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: retentionPct >= 70 ? 'positive' : retentionPct < 50 ? 'negative' : 'neutral',
  };

  const tilesRow2 = [platinumTile, goldTile, platinumRevTile, retentionTile];

  const tilesToRender = [memberTile, revenueTile, churnTile, clvTile].filter(
    Boolean,
  ) as KpiTileT[];

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Members, tiers, retention and lifetime value across the
            coalition.
          </p>
        </div>
        <Badge variant="outline">
          {formatInt(totalMembers)} members on file
        </Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="cust-kpi-heading" className="space-y-3">
        <header>
          <h2
            id="cust-kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Customer KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Active base, revenue, predicted churn and 12-month CLV.
          </p>
        </header>
        <KpiGrid>
          {(kpiQ.isLoading
            ? Array.from({ length: 4 })
            : tilesToRender
          ).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={kpiQ.isLoading && i < 2}
            />
          ))}
        </KpiGrid>

        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Tier mix & retention
          </h2>
          <p className="text-sm text-muted-foreground">
            Premium-tier penetration and predicted retention.
          </p>
        </header>
        <KpiGrid>
          {(tiersQ.isLoading
            ? Array.from({ length: 4 })
            : tilesRow2
          ).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={tiersQ.isLoading}
            />
          ))}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tier Distribution</CardTitle>
            <CardDescription>
              Members and revenue share by loyalty tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-3 pt-1">
              {tiers.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                tiers.map((t) => {
                  const pct = (t.members / totalMembers) * 100;
                  return (
                    <div
                      key={t.tier}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className="w-24 truncate font-medium text-foreground">
                        {t.tier}
                      </div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            background: TIER_COLORS[t.tier] ?? '#0F1120',
                          }}
                        />
                      </div>
                      <div className="w-20 text-right font-mono text-xs font-semibold text-foreground">
                        {formatInt(t.members)}
                      </div>
                      <div className="w-14 text-right font-mono text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
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
            <CardTitle>Active Member Growth</CardTitle>
            <CardDescription>
              Monthly active members across acquisition cohorts (last 12
              months).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              {growthSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={growthSeries}
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
                      formatter={(v: number) => [formatInt(v), 'Members']}
                    />
                    <Bar
                      dataKey="members"
                      fill="#F9C349"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Members by 12-month CLV</CardTitle>
          <CardDescription>
            Highest predicted lifetime value (next 12 months) — Gamma-Gamma
            model. Drill into Pro view (Predictive) for individual SHAP.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">Member ID</th>
                  <th className="px-5 py-2">CLV Tier</th>
                  <th className="px-5 py-2 text-right">Predicted CLV</th>
                  <th className="px-5 py-2 text-right">Retention</th>
                </tr>
              </thead>
              <tbody>
                {topClv.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading customer CLV…
                    </td>
                  </tr>
                ) : (
                  topClv.map((c, i) => (
                    <tr
                      key={c.customer_id}
                      className={i % 2 === 1 ? 'bg-muted/30' : ''}
                    >
                      <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-5 py-2 font-mono text-foreground">
                        {c.customer_id}
                      </td>
                      <td className="px-5 py-2 font-medium">{c.clv_tier}</td>
                      <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                        {formatAED(c.predicted_clv_12m)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {(c.retention_probability * 100).toFixed(1)}%
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
