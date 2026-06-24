'use client';

import { useQuery } from '@tanstack/react-query';
import { Calendar, Moon, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatAEDCompact, formatPct } from '@/lib/format';
import type { ForecastPoint } from '@/lib/types';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

type Scenario = 'base' | 'ramadan_plus' | 'downside';

/**
 * Scenario overlays apply a multiplier to the API-returned forecast so the
 * CFO can stress-test without a round-trip. Base = what the model returned.
 */
const SCENARIO_MULT: Record<Scenario, number> = {
  base: 1.0,
  ramadan_plus: 1.08,
  downside: 0.92,
};

const SCENARIO_LABEL: Record<Scenario, string> = {
  base: 'Base (model output)',
  ramadan_plus: 'Ramadan campaign ×1.08',
  downside: 'Bahrain lag ×0.92',
};

function applyScenario(data: ForecastPoint[], scenario: Scenario): ForecastPoint[] {
  const m = SCENARIO_MULT[scenario];
  if (m === 1.0) return data;
  return data.map((d) => ({
    ...d,
    revenue_forecast:
      d.revenue_actual !== null ? d.revenue_forecast : Math.round(d.revenue_forecast * m),
    revenue_lo: d.revenue_actual !== null ? d.revenue_lo : Math.round(d.revenue_lo * m),
    revenue_hi: d.revenue_actual !== null ? d.revenue_hi : Math.round(d.revenue_hi * m),
    liability_forecast: Math.round(d.liability_forecast * m),
  }));
}

export default function ForecastPage() {
  const [scenario, setScenario] = useState<Scenario>('base');
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:forecast',
    'all',
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['forecast-revenue'],
    queryFn: () => api.forecastRevenue(7),
  });

  const series = useMemo(
    () => (data ? applyScenario(data.series, scenario) : []),
    [data, scenario],
  );
  const lastActual = useMemo(
    () => series.filter((d) => d.revenue_actual !== null).slice(-1)[0],
    [series],
  );
  const liabilityPeak = useMemo(
    () => (series.length ? Math.max(...series.map((d) => d.liability_forecast)) : 0),
    [series],
  );
  const peak = useMemo(() => {
    if (!series.length) return null;
    const first = series[0]!;
    return series.reduce<ForecastPoint>(
      (best, d) => (d.revenue_forecast > best.revenue_forecast ? d : best),
      first,
    );
  }, [series]);

  const next6 = useMemo(() => {
    const future = series.filter((d) => d.revenue_actual === null);
    return future.slice(0, 6).reduce((a, d) => a + d.revenue_forecast, 0);
  }, [series]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Sticky window toolbar — banner refetches when this changes. */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
          </span>
          <div className="flex flex-col items-end gap-1">
            <WindowSelector value={timeWindow} onChange={setWindow} />
            {anchor && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Anchored to <span className="font-mono text-foreground">{anchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* HERO — live forecast headline. */}
      <DynamicBanner
        page="forecast"
        filters={filters}
        kicker={`Revenue + Liability forecast · ${data?.model_engine ?? 'Holt-Winters-lite'}`}
        fallbackHeadline={
          isLoading
            ? 'Forecasting the next 6–7 months…'
            : isError
              ? 'Forecast failed — try again once the warehouse is warm.'
              : (data?.headline.text ?? 'No forecast available yet.')
        }
        fallbackSubtitle="Trend + seasonal model fit on real monthly revenue from the warehouse. 90% confidence band shaded. Ramadan windows auto-flagged."
        polish
      />
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-[#F9C349] text-[#0F1120]">
          <Moon className="mr-1 h-3 w-3" /> Ramadan 2026: Feb 17 – Mar 18
        </Badge>
        <Badge variant="outline">
          <Calendar className="mr-1 h-3 w-3" /> Eid al-Fitr · Eid al-Adha
        </Badge>
      </div>

      {/* Scenario toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[#DA9712]" />
            Scenario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            role="tablist"
            aria-label="Forecast scenarios"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-white p-0.5"
          >
            {(Object.keys(SCENARIO_LABEL) as Scenario[]).map((s) => {
              const chosen = scenario === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={chosen}
                  onClick={() => setScenario(s)}
                  className={
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ' +
                    (chosen
                      ? 'bg-[#F9C349] text-[#0F1120] shadow-[0_2px_8px_rgba(249,195,73,0.35)]'
                      : 'text-foreground/75 hover:bg-muted')
                  }
                >
                  {SCENARIO_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Each scenario re-projects forecast months only (actuals are left unchanged). Liability
            curve re-projects with the same multiplier.
          </p>
        </CardContent>
      </Card>

      {/* Revenue forecast chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue forecast (AED) — 13-month rolling</CardTitle>
          <p className="text-sm text-muted-foreground">
            Actuals through {lastActual?.month ?? '—'}. 90% confidence band on forecast. Ramadan
            months shaded gold.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[380px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DC" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => formatAEDCompact(v as number)}
                    tick={{ fontSize: 11 }}
                    width={74}
                  />
                  <ReTooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue_lo' || name === 'revenue_hi' || name === 'hidden')
                        return null;
                      return [formatAEDCompact(value), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {series
                    .filter((d) => d.ramadan)
                    .map((d) => (
                      <ReferenceArea
                        key={d.month}
                        x1={d.month}
                        x2={d.month}
                        fill="#F9C349"
                        fillOpacity={0.18}
                      />
                    ))}
                  <Area
                    type="monotone"
                    dataKey="revenue_hi"
                    stroke="none"
                    fill="#F9C349"
                    fillOpacity={0.18}
                    name="90% band"
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue_lo"
                    stroke="none"
                    fill="#FDFCF8"
                    fillOpacity={1}
                    name="hidden"
                    legendType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue_actual"
                    stroke="#0F1120"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0F1120' }}
                    name="Actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue_forecast"
                    stroke="#DA9712"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                    name="Forecast"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Liability forecast + insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Points liability forecast (AED)</CardTitle>
            <p className="text-sm text-muted-foreground">
              IFRS 15 deferred-revenue projection. 26% breakage held flat; sensitivity ±1pp ≈ AED{' '}
              {liabilityPeak ? formatAEDCompact(liabilityPeak * 0.01) : '—'} shift on peak.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DC" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => formatAEDCompact(v as number)}
                      tick={{ fontSize: 11 }}
                      width={74}
                    />
                    <ReTooltip formatter={(v: number) => [formatAEDCompact(v), 'Liability']} />
                    <Area
                      type="monotone"
                      dataKey="liability_forecast"
                      stroke="#B4820E"
                      fill="#F9C349"
                      fillOpacity={0.35}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI forecast notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
              Ramadan uplift window ({formatPct(34, 0)} vs baseline) shaded gold.
            </p>
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Next-6mo revenue:{' '}
              <span className="font-semibold">{formatAEDCompact(next6)}</span>. Peak month{' '}
              <span className="font-semibold">{peak?.month ?? '—'}</span> at{' '}
              <span className="font-semibold">
                {peak ? formatAEDCompact(peak.revenue_forecast) : '—'}
              </span>
              .
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Liability peak:{' '}
              <span className="font-semibold">{formatAEDCompact(liabilityPeak)}</span>. Schedule
              redemption campaigns 60 days ahead of the peak to burn Nexus before the surge.
            </p>
            <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Engine: <span className="font-mono">{data?.model_engine ?? 'unknown'}</span>. Linear
              trend + seasonal factors per month + Ramadan multiplier. Upgrade path: swap the
              `/forecast/revenue` endpoint to Prophet or LSTM without any frontend change.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Actuals-to-date:{' '}
        <span className="font-medium">
          {data ? formatAEDCompact(data.actuals_total_aed) : '—'}
        </span>{' '}
        · projection horizon: 7 months · confidence interval: 90%.
      </p>
    </div>
  );
}
