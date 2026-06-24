'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calendar, Sparkles, TrendingDown } from 'lucide-react';
import type { ComponentType } from 'react';
import { useMemo } from 'react';

import { DevaluationCard } from '@/components/devaluation/devaluation-card';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { CohortCell } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const GOLD = '#F9C349';
const MAX_MONTH_OFFSET = 12;
// Dec-2024 was the Nexus devaluation — cohorts before vs after tell the story
const DEVALUATION_CUTOFF = '2024-12';

interface CohortRow {
  cohort: string;
  size: number;
  cells: Record<number, CohortCell>;
}

interface Grid {
  rows: CohortRow[];
  offsets: number[];
}

interface HighlightStat {
  label: string;
  cohort?: string;
  value: string;
  caption: string;
}

export default function CohortPage() {
  const { timeWindow, setWindow, filters: windowFilters, anchor } = useWindowFilters(
    'nexus:window:cohort',
    'all',
  );
  const { data, isLoading } = useQuery({
    queryKey: ['cohort', timeWindow],
    queryFn: () => api.cohort(),
  });

  const cells: CohortCell[] = useMemo(() => data ?? [], [data]);
  const grid = useMemo(() => buildGrid(cells), [cells]);
  const stats = useMemo(() => computeHighlights(grid), [grid]);
  const insight = useMemo(() => deriveInsight(grid), [grid]);
  const hasData = cells.length > 0;

  return (
    <div className="animate-fade-up space-y-8">
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
      {/* HERO — live retention headline from the warehouse. */}
      <DynamicBanner
        page="cohort"
        filters={windowFilters}
        kicker="Retention cohorts"
        fallbackHeadline="How long do Nexus members stick around after their first transaction — and where do we lose them?"
        fallbackSubtitle="Each row is a monthly signup cohort; each column is months since their first transaction. Computing median M3 / M6 retention from the warehouse…"
        polish
      />


      {/* HIGHLIGHT TILES */}
      <section
        aria-labelledby="cohort-highlights-heading"
        className="grid grid-cols-1 auto-rows-fr gap-3 md:grid-cols-3"
      >
        <h2 id="cohort-highlights-heading" className="sr-only">
          Cohort highlights
        </h2>
        <HighlightTile
          icon={Sparkles}
          accent="gold"
          label="Best cohort"
          stat={stats.best}
          loading={isLoading}
        />
        <HighlightTile
          icon={TrendingDown}
          accent="negative"
          label="Worst cohort"
          stat={stats.worst}
          loading={isLoading}
        />
        <HighlightTile
          icon={Calendar}
          accent="positive"
          label="Median M6 retention"
          stat={stats.median}
          loading={isLoading}
        />
      </section>

      {/* HEATMAP */}
      <section
        aria-labelledby="cohort-heatmap-heading"
        className="rounded-2xl border border-border bg-surface p-5 shadow-tile"
      >
        <header className="mb-4 flex flex-col gap-1">
          <h2
            id="cohort-heatmap-heading"
            className="font-display text-[18px] font-semibold leading-tight"
          >
            Retention heatmap
          </h2>
          <p className="text-sm text-muted-foreground">
            Rows = signup cohort (with cohort size). Columns = months since first txn (M0…M
            {MAX_MONTH_OFFSET}). Darker gold = higher active rate. Hover a cell for raw counts.
          </p>
        </header>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : grid.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No cohort data available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div
              role="table"
              aria-label="Retention heatmap by cohort and months since first transaction"
              className="min-w-max"
            >
              {/* header row */}
              <div
                role="row"
                className="grid items-center border-b border-border/60 pb-2"
                style={{
                  gridTemplateColumns: `minmax(140px, 180px) repeat(${grid.offsets.length}, minmax(54px, 1fr))`,
                }}
              >
                <div
                  role="columnheader"
                  className="pl-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Cohort / size
                </div>
                {grid.offsets.map((o) => (
                  <div
                    key={o}
                    role="columnheader"
                    className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    M{o}
                  </div>
                ))}
              </div>

              {/* body rows */}
              {grid.rows.map((row) => {
                const post = row.cohort >= DEVALUATION_CUTOFF;
                return (
                  <div
                    key={row.cohort}
                    role="row"
                    className="grid items-center border-b border-border/30 py-1 last:border-0"
                    style={{
                      gridTemplateColumns: `minmax(140px, 180px) repeat(${grid.offsets.length}, minmax(54px, 1fr))`,
                    }}
                  >
                    <div
                      role="rowheader"
                      className="flex items-center gap-2 pl-1 text-[12px]"
                    >
                      <span className="font-medium tabular-nums">{row.cohort}</span>
                      {post ? (
                        <span
                          title="Post-devaluation cohort (Dec 2024 and later)"
                          className="rounded-sm bg-[#FFE7DD] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-[#C84C2A]"
                        >
                          post-deval
                        </span>
                      ) : null}
                      <span className="ml-auto pr-2 text-[11px] tabular-nums text-muted-foreground">
                        {row.size.toLocaleString('en-US')}
                      </span>
                    </div>
                    {grid.offsets.map((o) => {
                      const cell = row.cells[o];
                      return (
                        <div
                          key={o}
                          role="cell"
                          title={
                            cell
                              ? `${row.cohort} · M${o} · ${cell.active_count.toLocaleString()} of ${cell.cohort_size.toLocaleString()} active (${(
                                  cell.active_rate * 100
                                ).toFixed(1)}%)`
                              : undefined
                          }
                          className={cn(
                            'mx-[2px] flex h-9 items-center justify-center rounded-md border text-[11px] font-medium tabular-nums transition-colors',
                            cell
                              ? textColorForRate(cell.active_rate)
                              : 'border-dashed border-border/40 text-muted-foreground/40',
                          )}
                          style={
                            cell
                              ? {
                                  backgroundColor: heatColor(cell.active_rate),
                                  borderColor:
                                    cell.active_rate >= 0.5
                                      ? '#DA9712'
                                      : 'rgba(218, 151, 18, 0.25)',
                                }
                              : undefined
                          }
                        >
                          {cell ? `${Math.round(cell.active_rate * 100)}%` : '—'}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.12em]">Active rate</span>
              <div className="flex items-center gap-1">
                {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((r) => (
                  <span
                    key={r}
                    className="inline-block h-3 w-6 rounded-sm border border-black/5"
                    style={{ backgroundColor: heatColor(r) }}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="tabular-nums">0% → 100%</span>
            </div>
          </div>
        )}
      </section>

      {/* INSIGHT CARD */}
      <section className="rounded-2xl border border-[#F9C349]/40 bg-[#FDF5E0] p-5 shadow-tile">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
          <Sparkles className="h-3 w-3" /> Where retention cracks
        </p>
        <p className="mt-2 text-base font-semibold text-foreground">
          {hasData ? insight.headline : 'Awaiting cohort data from the warehouse.'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasData
            ? insight.body
            : 'Cohort aggregation needs at least 2 months of signups. Once the warehouse has enough history the heatmap populates automatically.'}
        </p>
      </section>

      {/* DEVALUATION RECOVERY — Dec-2024 Nexus ratio change */}
      <DevaluationCard />

      {/* AUDIT FOOTER */}
      <p className="text-center text-[10px] text-muted-foreground">
        Source: <code className="font-mono">/api/v1/cohort/retention</code> · pipeline:{' '}
        <code className="font-mono">cohort_retention_monthly</code> · period: rolling 18-month
        signup window · cells truncated at M{MAX_MONTH_OFFSET}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function buildGrid(cells: CohortCell[]): Grid {
  const byCohort: Record<string, CohortRow> = {};
  const offsetSet = new Set<number>();
  for (const cell of cells) {
    if (cell.month_offset > MAX_MONTH_OFFSET) continue;
    const key = cell.cohort_month;
    if (!byCohort[key]) {
      byCohort[key] = { cohort: key, size: cell.cohort_size, cells: {} };
    }
    byCohort[key].cells[cell.month_offset] = cell;
    byCohort[key].size = cell.cohort_size;
    offsetSet.add(cell.month_offset);
  }
  const rows = Object.values(byCohort).sort((a, b) => a.cohort.localeCompare(b.cohort));
  const offsets = [...offsetSet].sort((a, b) => a - b);
  return { rows, offsets };
}

function computeHighlights(grid: Grid): {
  best: HighlightStat;
  worst: HighlightStat;
  median: HighlightStat;
} {
  const m3Rows = grid.rows
    .map((r) => ({ cohort: r.cohort, size: r.size, rate: r.cells[3]?.active_rate }))
    .filter((r): r is { cohort: string; size: number; rate: number } =>
      typeof r.rate === 'number',
    );

  const best = m3Rows.length
    ? m3Rows.reduce((acc, r) => (r.rate > acc.rate ? r : acc))
    : undefined;
  const worst = m3Rows.length
    ? m3Rows.reduce((acc, r) => (r.rate < acc.rate ? r : acc))
    : undefined;

  const m6Rates = grid.rows
    .map((r) => r.cells[6]?.active_rate)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b);
  const median = m6Rates.length
    ? m6Rates[Math.floor(m6Rates.length / 2)]
    : undefined;

  return {
    best: {
      label: 'Best cohort',
      cohort: best?.cohort,
      value: best ? `${Math.round(best.rate * 100)}%` : '—',
      caption: best
        ? `Month-3 active · ${best.size.toLocaleString('en-US')} members`
        : 'No cohort data',
    },
    worst: {
      label: 'Worst cohort',
      cohort: worst?.cohort,
      value: worst ? `${Math.round(worst.rate * 100)}%` : '—',
      caption: worst
        ? `Month-3 active · ${worst.size.toLocaleString('en-US')} members`
        : 'No cohort data',
    },
    median: {
      label: 'Median M6 retention',
      cohort: 'Across all cohorts',
      value: median != null ? `${Math.round(median * 100)}%` : '—',
      caption:
        m6Rates.length > 0
          ? `Half of cohorts hold above this line at month 6`
          : 'Not enough M6 data yet',
    },
  };
}

function deriveInsight(grid: Grid): { headline: string; body: string } {
  const pre: number[] = [];
  const post: number[] = [];
  for (const row of grid.rows) {
    const m3 = row.cells[3]?.active_rate;
    if (typeof m3 !== 'number') continue;
    if (row.cohort >= DEVALUATION_CUTOFF) post.push(m3);
    else pre.push(m3);
  }

  if (pre.length > 0 && post.length > 0) {
    const preAvg = avg(pre);
    const postAvg = avg(post);
    const gap = (preAvg - postAvg) * 100;
    if (Math.abs(gap) >= 1) {
      const direction = gap > 0 ? 'cost us' : 'gained us';
      return {
        headline: `Post-devaluation cohorts retain ${Math.round(
          postAvg * 100,
        )}% at month 3 vs ${Math.round(preAvg * 100)}% before — the Dec-2024 reset ${direction} ~${Math.abs(
          gap,
        ).toFixed(0)} pp retention.`,
        body: 'Members who joined after the Nexus devaluation drop off faster inside the critical first quarter. Every point those members earned still ticks toward the 24-month expiry — so the retention loss compounds into larger breakage and weaker repeat-purchase revenue. Prioritise a month-2 re-engagement nudge for post-Dec-2024 cohorts.',
      };
    }
  }

  // Fallback: call out the biggest early-month drop across cohorts
  let worstDrop = { cohort: '—', m0: 0, m1: 0, delta: 0 };
  for (const row of grid.rows) {
    const m0 = row.cells[0]?.active_rate;
    const m1 = row.cells[1]?.active_rate;
    if (typeof m0 !== 'number' || typeof m1 !== 'number') continue;
    const delta = m0 - m1;
    if (delta > worstDrop.delta) worstDrop = { cohort: row.cohort, m0, m1, delta };
  }

  if (worstDrop.delta > 0) {
    return {
      headline: `${worstDrop.cohort} lost ${Math.round(
        worstDrop.delta * 100,
      )} pp of its base between month 0 and month 1 — the steepest first-month drop in the window.`,
      body: 'First-month churn is the single largest lever in a 1-Nexus-per-AED program: members who do not return within 30 days rarely come back without an intervention, and their earned points quietly age toward the 24-month expiry. A welcome-back offer inside the first 30 days is the highest-ROI fix.',
    };
  }

  return {
    headline: 'Retention holds roughly flat across cohorts — no break-glass anomaly yet.',
    body: 'Keep monitoring the month-3 and month-6 columns. A 5+ pp dip month-over-month in new cohorts is the earliest signal that a pricing or product change is hurting stickiness before it shows up in headline revenue.',
  };
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function heatColor(rate: number): string {
  const clamped = Math.max(0, Math.min(1, rate));
  // Gold scale against cream background: alpha 0.08 → 0.95 on #F9C349
  const alpha = 0.08 + clamped * 0.87;
  const { r, g, b } = hexToRgb(GOLD);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function textColorForRate(rate: number): string {
  return rate >= 0.55 ? 'text-[#3A2500]' : 'text-foreground';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// ──────────────────────────────────────────────────────────
// Highlight tile
// ──────────────────────────────────────────────────────────
function HighlightTile({
  icon: Icon,
  accent,
  label,
  stat,
  loading,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: 'gold' | 'positive' | 'negative';
  label: string;
  stat: HighlightStat;
  loading: boolean;
}) {
  const accentClasses: Record<'gold' | 'positive' | 'negative', string> = {
    gold: 'bg-[#FDF5E0] text-[#B4820E] ring-1 ring-[#F9C349]/30',
    positive: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    negative: 'bg-[#FFE7DD] text-[#C84C2A] ring-1 ring-[#F2714C]/30',
  };
  if (loading) {
    return <Skeleton className="h-[140px] w-full rounded-xl" />;
  }
  return (
    <article className="grid min-h-[140px] grid-rows-[auto_1fr_auto] rounded-xl border border-border bg-surface p-4 shadow-tile">
      <header className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            accentClasses[accent],
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </header>
      <div className="flex flex-col justify-center">
        <p className="truncate font-display text-base font-semibold text-foreground">
          {stat.cohort ?? '—'}
        </p>
        <p className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums">
          {stat.value}
        </p>
      </div>
      <footer className="flex items-start gap-1.5 pt-2 text-[11px] text-muted-foreground">
        {accent === 'negative' ? (
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0 text-[#C84C2A]" aria-hidden />
        ) : null}
        <span>{stat.caption}</span>
      </footer>
    </article>
  );
}
