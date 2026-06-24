'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  Area,
  AreaChart,
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

export default function OutlookPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <OutlookContent />
    </Suspense>
  );
}

function OutlookContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const forecastQ = useQuery({
    queryKey: ['outlook-forecast', filters],
    queryFn: () => api.forecastRevenue(180),
  });
  const ifrsQ = useQuery({
    queryKey: ['outlook-ifrs', filters],
    queryFn: () => api.ifrsAging(filters),
  });

  const series = forecastQ.data?.series ?? [];
  const forecastChart = series.map((p) => ({
    label: new Date(p.iso_date).toLocaleDateString('en-AE', {
      month: 'short',
      year: '2-digit',
    }),
    actual: p.revenue_actual ?? null,
    forecast: p.revenue_forecast,
    lo: p.revenue_lo,
    hi: p.revenue_hi,
    ramadan: p.ramadan,
  }));

  const buckets = ifrsQ.data?.buckets ?? [];
  const totalLiability = ifrsQ.data?.total_liability_aed ?? 0;
  const breakageMean = ifrsQ.data?.breakage_mean ?? 0;
  const expiring90d = ifrsQ.data?.expiring_90d.liability_aed ?? 0;
  const expiringMembers = ifrsQ.data?.expiring_90d.member_count ?? 0;

  const peakMonth = forecastQ.data?.peak_month ?? '—';
  const next6mo = forecastQ.data?.next_6mo_aed ?? 0;
  const ramadanMonths = forecastChart.filter((p) => p.ramadan).length;

  const liabilityBars = buckets.map((b) => ({
    label: b.age_bucket,
    redemption: b.expected_redemption_aed,
    breakage: b.expected_breakage_aed,
  }));

  const tiles: KpiTileT[] = [
    {
      id: 'forecast_6mo',
      label: 'Next 6-mo Revenue',
      value: next6mo,
      value_display: next6mo > 0 ? formatAED(next6mo) : '—',
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'positive',
    },
    {
      id: 'liability',
      label: 'Points Liability',
      value: totalLiability,
      value_display: totalLiability > 0 ? formatAED(totalLiability) : '—',
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'expiring_90d',
      label: 'Expiring in 90 days',
      value: expiring90d,
      value_display: expiring90d > 0 ? formatAED(expiring90d) : '—',
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: expiring90d > 1_000_000 ? 'negative' : 'neutral',
    },
    {
      id: 'peak_month',
      label: 'Peak Month',
      value: 0,
      value_display: peakMonth,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Outlook — forecast &amp; liability
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Six-month revenue forecast (Ramadan-aware) and IFRS-15 points
            liability aging.
          </p>
        </div>
        <Badge variant="outline">
          {ramadanMonths > 0
            ? `${ramadanMonths} Ramadan month${ramadanMonths > 1 ? 's' : ''} in window`
            : 'Non-Ramadan window'}{' '}
          · breakage est. {(breakageMean * 100).toFixed(1)}%
        </Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="outlook-kpi-heading" className="space-y-3">
        <header>
          <h2
            id="outlook-kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Forward indicators
          </h2>
          <p className="text-sm text-muted-foreground">
            Revenue, liability, and the points expiring in the next 90
            days. {formatInt(expiringMembers)} members at risk.
          </p>
        </header>
        <KpiGrid>
          {(forecastQ.isLoading ? Array.from({ length: 4 }) : tiles).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={forecastQ.isLoading}
              />
            ),
          )}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Forecast — next 6 months</CardTitle>
            <CardDescription>
              Forecast (navy) vs actuals (gray) with Ramadan months marked.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full">
              {forecastChart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading forecast…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={forecastChart}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="forecastBand"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#F9C349"
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="100%"
                          stopColor="#F9C349"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
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
                        name === 'forecast'
                          ? 'Forecast'
                          : name === 'actual'
                            ? 'Actual'
                            : name === 'lo'
                              ? 'P10'
                              : 'P90',
                      ]}
                      labelFormatter={(label, payload) => {
                        const r = payload?.[0]?.payload?.ramadan;
                        return r ? `${label} · Ramadan` : String(label);
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="hi"
                      stroke="none"
                      fill="url(#forecastBand)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="lo"
                      stroke="none"
                      fill="#FFFFFF"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="#9CA3AF"
                      strokeWidth={1.5}
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="forecast"
                      stroke="#0F1120"
                      strokeWidth={2.25}
                      fill="none"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liability Aging — buckets</CardTitle>
            <CardDescription>
              Expected redemption (gold) vs expected breakage (gray) per
              age bucket.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full">
              {liabilityBars.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading liability aging…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={liabilityBars}
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
                        name === 'redemption'
                          ? 'Expected Redeem'
                          : 'Expected Breakage',
                      ]}
                    />
                    <Bar
                      dataKey="redemption"
                      fill="#F9C349"
                      stackId="a"
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="breakage"
                      fill="#9CA3AF"
                      stackId="a"
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
          <CardTitle>Aging Buckets — full schedule</CardTitle>
          <CardDescription>
            IFRS-15 points-liability aging. Drill into Pro view (IFRS 15
            close) for the quarterly close.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2">Age</th>
                  <th className="px-5 py-2 text-right">Liability</th>
                  <th className="px-5 py-2 text-right">Expected Redeem</th>
                  <th className="px-5 py-2 text-right">Expected Breakage</th>
                  <th className="px-5 py-2 text-right">Uncommitted</th>
                </tr>
              </thead>
              <tbody>
                {buckets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : (
                  buckets.map((b, i) => (
                    <tr
                      key={b.age_bucket}
                      className={i % 2 === 1 ? 'bg-muted/30' : ''}
                    >
                      <td className="px-5 py-2 font-medium text-foreground">
                        {b.age_bucket}
                      </td>
                      <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                        {formatAED(b.liability_aed)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {formatAED(b.expected_redemption_aed)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {formatAED(b.expected_breakage_aed)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-muted-foreground">
                        {formatAED(b.uncommitted_aed)}
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
