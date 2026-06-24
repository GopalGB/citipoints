'use client';

/**
 * AnomalySeriesChart — UX-first redesign of the daily revenue + anomaly view.
 *
 * The previous daily line-on-line chart was visually noisy: two overlapping
 * squiggles and a row of red dots. This component:
 *   1. Auto-aggregates daily points to weekly or monthly buckets when the
 *      window is long, so the eye can actually read the trend.
 *   2. Replaces twin lines with a single gradient area (actual) and a subtle
 *      dashed baseline (expected) — one primary signal, one reference.
 *   3. Sizes and colours anomaly dots by severity (|z|); spike = rose, dip =
 *      sky. Click any dot → explain modal.
 *   4. Adds a brush for zoom and a stats strip for instant take-aways.
 */

import { format } from 'date-fns';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAED, formatCompact } from '@/lib/format';
import type { AnomalyPoint } from '@/lib/types';
import { cn } from '@/lib/utils';

export type AnomalyBucket = 'daily' | 'weekly' | 'monthly';

interface Props {
  data: AnomalyPoint[] | undefined;
  isLoading: boolean;
  onAnomalyClick?: (point: AnomalyPoint) => void;
}

interface Row {
  key: string;
  label: string;
  date: string;
  revenue: number;
  expected: number;
  residual: number;
  abs_residual: number;
  is_anomaly: boolean;
  direction: 'up' | 'down' | 'flat';
  sourcePoint: AnomalyPoint | null;
}

export function AnomalySeriesChart({ data, isLoading, onAnomalyClick }: Props) {
  const defaultBucket: AnomalyBucket = useMemo(() => {
    if (!data || data.length === 0) return 'daily';
    if (data.length > 180) return 'weekly';
    if (data.length > 60) return 'weekly';
    return 'daily';
  }, [data]);

  const [bucket, setBucket] = useState<AnomalyBucket>(defaultBucket);
  const [mode, setMode] = useState<'area' | 'line'>('area');

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    if (bucket === 'daily') {
      return data.map((p) => ({
        key: p.date,
        label: safeFormat(p.date, 'MMM d'),
        date: p.date,
        revenue: p.revenue,
        expected: p.expected,
        residual: p.residual,
        abs_residual: Math.abs(p.residual ?? 0),
        is_anomaly: p.is_anomaly,
        direction:
          p.residual > 0 ? 'up' : p.residual < 0 ? 'down' : 'flat',
        sourcePoint: p,
      }));
    }
    return aggregate(data, bucket);
  }, [data, bucket]);

  const anomalies = rows.filter((r) => r.is_anomaly);
  const spikes = anomalies.filter((a) => a.direction === 'up');
  const dips = anomalies.filter((a) => a.direction === 'down');

  const biggestSpike = spikes.reduce<Row | null>(
    (acc, r) => (!acc || r.abs_residual > acc.abs_residual ? r : acc),
    null,
  );
  const biggestDip = dips.reduce<Row | null>(
    (acc, r) => (!acc || r.abs_residual > acc.abs_residual ? r : acc),
    null,
  );

  const residualBand = useMemo(() => {
    if (rows.length === 0) return 0;
    const sorted = [...rows].map((r) => Math.abs(r.residual ?? 0)).sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
    return p80;
  }, [rows]);

  const maxDotR = 9;
  const minDotR = 4;
  const dotRadius = (r: Row) => {
    if (residualBand === 0) return minDotR;
    const scale = Math.min(1, r.abs_residual / (residualBand * 2));
    return minDotR + (maxDotR - minDotR) * scale;
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-base font-semibold">
                Revenue · actual vs expected
              </h3>
              <Badge variant={anomalies.length > 0 ? 'warning' : 'primary'}>
                {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected baseline = trend + weekly seasonality (STL). Points beyond 2.5σ are
              anomalies. Dot size scales with how far from expected.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              ariaLabel="Aggregation"
              value={bucket}
              onChange={(v) => setBucket(v as AnomalyBucket)}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
            <ToggleGroup
              ariaLabel="Chart style"
              value={mode}
              onChange={(v) => setMode(v as 'area' | 'line')}
              options={[
                { value: 'area', label: 'Area' },
                { value: 'line', label: 'Line' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            icon={CalendarDays}
            label="Buckets"
            primary={rows.length.toString()}
            secondary={
              bucket === 'daily'
                ? 'days in window'
                : bucket === 'weekly'
                  ? 'weeks in window'
                  : 'months in window'
            }
          />
          <StatTile
            icon={AlertTriangle}
            label="Anomalies"
            primary={anomalies.length.toString()}
            secondary={
              anomalies.length > 0
                ? `${((anomalies.length / Math.max(rows.length, 1)) * 100).toFixed(1)}% of buckets`
                : 'none detected'
            }
            accent={anomalies.length > 0 ? 'warning' : 'muted'}
          />
          <StatTile
            icon={ArrowUpRight}
            label="Biggest spike"
            primary={biggestSpike ? `+${formatCompact(biggestSpike.abs_residual)}` : '—'}
            secondary={biggestSpike ? biggestSpike.label : 'no spikes'}
            accent={biggestSpike ? 'success' : 'muted'}
          />
          <StatTile
            icon={ArrowDownRight}
            label="Biggest dip"
            primary={biggestDip ? `−${formatCompact(biggestDip.abs_residual)}` : '—'}
            secondary={biggestDip ? biggestDip.label : 'no dips'}
            accent={biggestDip ? 'danger' : 'muted'}
          />
        </div>

        <LegendStrip />

        <div id="anomaly-series" className="h-[360px] w-full">
          {isLoading || rows.length === 0 ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v)}
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                  content={<CustomTooltip />}
                />

                <Line
                  type="monotone"
                  dataKey="expected"
                  name="Expected"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />

                {mode === 'area' ? (
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.25}
                    fill="url(#actualFill)"
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.25}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}

                {anomalies.map((r) => {
                  const color = r.direction === 'up' ? 'hsl(var(--success))' : 'hsl(var(--danger))';
                  return (
                    <ReferenceDot
                      key={r.key}
                      x={r.label}
                      y={r.revenue}
                      r={dotRadius(r)}
                      fill={color}
                      stroke="hsl(var(--surface))"
                      strokeWidth={2}
                      onClick={() =>
                        r.sourcePoint && onAnomalyClick ? onAnomalyClick(r.sourcePoint) : undefined
                      }
                      style={{
                        cursor: r.sourcePoint && onAnomalyClick ? 'pointer' : 'default',
                      }}
                    />
                  );
                })}

                {rows.length > 14 ? (
                  <Brush
                    dataKey="label"
                    height={22}
                    stroke="hsl(var(--primary))"
                    travellerWidth={8}
                    tickFormatter={() => ''}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function safeFormat(iso: string, pattern: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, pattern);
}

function weekKey(iso: string): { key: string; label: string; date: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: iso, label: iso, date: iso };
  const day = d.getUTCDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const key = monday.toISOString().slice(0, 10);
  return { key, label: `wk of ${format(monday, 'MMM d')}`, date: key };
}

function monthKey(iso: string): { key: string; label: string; date: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: iso, label: iso, date: iso };
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { key, label: format(d, 'MMM yyyy'), date: `${key}-01` };
}

function aggregate(points: AnomalyPoint[], bucket: 'weekly' | 'monthly'): Row[] {
  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      date: string;
      revenue: number;
      expected: number;
      residual: number;
      is_anomaly: boolean;
      hardest: AnomalyPoint | null;
    }
  >();

  for (const p of points) {
    const { key, label, date } = bucket === 'weekly' ? weekKey(p.date) : monthKey(p.date);
    const current = buckets.get(key);
    if (current) {
      current.revenue += p.revenue;
      current.expected += p.expected;
      current.residual += p.residual;
      if (p.is_anomaly) current.is_anomaly = true;
      if (
        p.is_anomaly &&
        (!current.hardest || Math.abs(p.residual) > Math.abs(current.hardest.residual))
      ) {
        current.hardest = p;
      }
    } else {
      buckets.set(key, {
        key,
        label,
        date,
        revenue: p.revenue,
        expected: p.expected,
        residual: p.residual,
        is_anomaly: p.is_anomaly,
        hardest: p.is_anomaly ? p : null,
      });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((b) => ({
      key: b.key,
      label: b.label,
      date: b.date,
      revenue: b.revenue,
      expected: b.expected,
      residual: b.residual,
      abs_residual: Math.abs(b.residual),
      is_anomaly: b.is_anomaly,
      direction: b.residual > 0 ? 'up' : b.residual < 0 ? 'down' : 'flat',
      sourcePoint: b.hardest,
    }));
}

// ─────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const deltaPct = row.expected
    ? (row.residual / row.expected) * 100
    : 0;
  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {row.label}
      </p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            Actual
          </span>
          <span className="font-medium tabular-nums">{formatAED(row.revenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-muted-foreground" aria-hidden />
            Expected
          </span>
          <span className="tabular-nums text-muted-foreground">{formatAED(row.expected)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-border pt-1">
          <span className="text-muted-foreground">Delta</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              row.residual > 0 ? 'text-success' : row.residual < 0 ? 'text-danger' : 'text-muted-foreground',
            )}
          >
            {row.residual >= 0 ? '+' : '−'}
            {formatAED(Math.abs(row.residual))}{' '}
            <span className="text-xs font-normal">
              ({deltaPct >= 0 ? '+' : ''}
              {deltaPct.toFixed(1)}%)
            </span>
          </span>
        </div>
        {row.is_anomaly ? (
          <div className="mt-1 flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning-foreground">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Flagged anomaly · click the dot on the chart for the AI explanation
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UI bits
// ─────────────────────────────────────────────────────────────

interface ToggleOption {
  value: string;
  label: string;
}

function ToggleGroup({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: ToggleOption[];
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-full border border-border bg-background p-0.5 text-xs"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'px-3 py-1 font-medium transition-colors',
            value === o.value
              ? 'rounded-full bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  primary,
  secondary,
  accent = 'muted',
}: {
  icon: typeof Sparkles;
  label: string;
  primary: string;
  secondary: string;
  accent?: 'muted' | 'success' | 'warning' | 'danger';
}) {
  const accentClass = {
    muted: 'bg-muted text-foreground',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
  }[accent];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md',
          accentClass,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold tabular-nums text-foreground">
          {primary}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
}

function LegendStrip() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-sm bg-primary" aria-hidden />
        Actual revenue
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 border-t border-dashed border-muted-foreground" aria-hidden />
        Expected (model baseline)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
        Spike (above expected)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
        Dip (below expected)
      </span>
      <span className="ml-auto text-[11px]">
        Tip: drag the brush below the chart to zoom · click any dot for AI explanation
      </span>
    </div>
  );
}
