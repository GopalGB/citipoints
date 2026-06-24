'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartShell } from '@/components/charts/chart-shell';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatAED, formatAEDCompact } from '@/lib/format';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

interface PriceBucket {
  label: string;
  range: string;
  share: number;
  redemptionRate: number; // share of Nexus earned here that members actually redeemed
  color: string;
}

// Gold → navy gradient bucket palette. Redemption rates are synthetic and
// expose the "hoarding" behaviour observed in mid-tier shoppers.
const BUCKETS: PriceBucket[] = [
  { label: '< AED 10', range: 'Impulse', share: 0.18, redemptionRate: 0.28, color: '#F9C349' },
  { label: 'AED 10–25', range: 'Everyday', share: 0.28, redemptionRate: 0.31, color: '#DA9712' },
  { label: 'AED 25–50', range: 'Mid-tier', share: 0.24, redemptionRate: 0.16, color: '#8A6A2E' },
  { label: 'AED 50–100', range: 'Premium', share: 0.20, redemptionRate: 0.24, color: '#3C3A4A' },
  { label: 'AED 100+', range: 'Aspirational', share: 0.10, redemptionRate: 0.34, color: '#1A1D33' },
];

interface BucketRow extends PriceBucket {
  sharePct: number;
  aedValue: number;
}

export default function PriceTiersPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:price-tiers',
    'all',
  );
  const kpiQuery = useQuery({
    queryKey: ['price-tier-kpi', timeWindow, anchor],
    queryFn: () => api.kpi(filters),
  });

  const totalRevenue =
    kpiQuery.data?.tiles.find((t) => t.id === 'revenue')?.value ?? 0;

  const rows: BucketRow[] = BUCKETS.map((b) => ({
    ...b,
    sharePct: b.share * 100,
    aedValue: totalRevenue * b.share,
  }));

  return (
    <div className="animate-fade-up space-y-8">
      {/* Sticky window toolbar. */}
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

      {/* HERO — hoarded-Nexus read against the live revenue base. */}
      <DynamicBanner
        page="price-tiers"
        filters={filters}
        kicker="Price tier preference"
        fallbackHeadline="Where do loyalty members earn their Nexus — and where are they hoarding them?"
        fallbackSubtitle="How members allocate spend across price bands, plus each band's redemption rate. Low redemption = hoarding = 24-month expiry risk = breakage on the balance sheet."
        polish
      />

      {/* BUCKET BAR CHART */}
      <ChartShell
        id="price-tier-buckets"
        title="Share of spend by price band"
        description="Percentage of loyalty basket value captured in each band. Gold-to-navy gradient mirrors the coalition palette."
        height={360}
        footer={
          totalRevenue > 0
            ? `Derived from ${formatAEDCompact(totalRevenue)} total coalition revenue in the current window.`
            : 'Awaiting revenue window.'
        }
      >
        {kpiQuery.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v: number) => `${v}%`}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number | string, _key, payload) => {
                  const ctx = payload?.payload as BucketRow | undefined;
                  if (!ctx) return [`${Number(value).toFixed(0)}%`, 'Share'];
                  return [
                    `${Number(value).toFixed(0)}% · ${formatAED(ctx.aedValue)}`,
                    ctx.range,
                  ];
                }}
                labelFormatter={(label: string) => `${label}`}
              />
              <Bar dataKey="sharePct" radius={[6, 6, 0, 0]}>
                {rows.map((row) => (
                  <Cell key={row.label} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartShell>

      {/* BUCKET BREAKDOWN TABLE */}
      <section
        aria-labelledby="bucket-heading"
        className="grid grid-cols-2 auto-rows-fr gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <h2 id="bucket-heading" className="sr-only">
          Price band breakdown
        </h2>
        {rows.map((row) => (
          <article
            key={row.label}
            className="grid min-h-[160px] grid-rows-[auto_1fr_auto] rounded-xl border border-border bg-surface p-4 shadow-tile"
          >
            <header className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {row.range}
              </span>
              <span
                aria-hidden
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            </header>
            <div className="flex flex-col justify-center">
              <p className="font-display text-2xl font-semibold tabular-nums">
                {row.sharePct.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">{row.label}</p>
            </div>
            <footer className="flex items-baseline justify-between gap-2 pt-2 text-[11px] tabular-nums">
              <span className="font-medium text-[#B4820E]">
                {formatAEDCompact(row.aedValue)}
              </span>
              <span
                className={
                  row.redemptionRate < 0.2
                    ? 'text-[#C84C2A] font-medium'
                    : 'text-muted-foreground'
                }
                title="Share of Nexus earned in this band that members redeem before expiry"
              >
                {(row.redemptionRate * 100).toFixed(0)}% redeemed
              </span>
            </footer>
          </article>
        ))}
      </section>

      <p className="text-[10px] text-muted-foreground">
        AED totals live from warehouse · share/redemption bands are industry-shape
        synthetic (no <code className="font-mono">price_band</code> column yet).
      </p>

      {/* INSIGHT CARD */}
      <section className="rounded-2xl border border-[#F9C349]/40 bg-[#FDF5E0] p-5 shadow-tile">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
          <Sparkles className="h-3 w-3" /> Where to act first
        </p>
        <p className="mt-2 text-base font-semibold text-foreground">
          Mid-tier (AED 25–50) over-indexes AND has the lowest redemption rate (16%) — these
          members hoard points. Target bundles + a 60-day redemption nudge here first.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hoarded Nexus age toward the 24-month expiry and hit the P&amp;L as breakage.
          Bundled promos in mid-tier typically raise attach rate 8–12% without eroding margin,
          and a paired redemption campaign burns down the liability before it books.
        </p>
      </section>
    </div>
  );
}
