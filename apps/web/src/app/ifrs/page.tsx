'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { IFRS_QUARTERLY_DEMO } from '@/lib/demo-data';
import { formatAEDCompact, formatInt } from '@/lib/format';
import type { IfrsAgingBucket } from '@/lib/types';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const Q = IFRS_QUARTERLY_DEMO;

export default function IfrsPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:ifrs',
    'all',
  );
  const net = Q.closing_liability_aed - Q.opening_liability_aed;
  const netPct = (net / Q.opening_liability_aed) * 100;

  const waterfall = [
    { label: 'Opening liability', value: Q.opening_liability_aed, kind: 'start' as const },
    { label: 'Points issued', value: Q.points_issued_aed, kind: 'up' as const },
    { label: 'Points redeemed', value: -Q.points_redeemed_aed, kind: 'down' as const },
    { label: 'Breakage release', value: -Q.breakage_release_aed, kind: 'down' as const },
    { label: 'Closing liability', value: Q.closing_liability_aed, kind: 'end' as const },
  ];

  const agingQuery = useQuery({
    queryKey: ['ifrs-aging', timeWindow, filters.date_from, filters.date_to],
    queryFn: () => api.ifrsAging(filters),
  });

  const aging = agingQuery.data;

  const exportBrief = () => {
    if (typeof window === 'undefined') return;
    const body = [
      `Nexus — IFRS 15 Quarterly Close · ${Q.quarter}`,
      ``,
      `Opening liability:   ${formatAEDCompact(Q.opening_liability_aed)}`,
      `Points issued:       ${formatAEDCompact(Q.points_issued_aed)}`,
      `Points redeemed:     ${formatAEDCompact(Q.points_redeemed_aed)}`,
      `Breakage release:    ${formatAEDCompact(Q.breakage_release_aed)}`,
      `Closing liability:   ${formatAEDCompact(Q.closing_liability_aed)}`,
      ``,
      `Net change: ${net >= 0 ? '+' : ''}${formatAEDCompact(net)} (${netPct.toFixed(1)}%)`,
      `Sensitivity: 1 pp breakage = ${formatAEDCompact(Q.sensitivity_1pp)}`,
      ``,
      `Notes:`,
      ...Q.notes.map((n, i) => `  ${i + 1}. ${n}`),
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-ifrs15-${Q.quarter}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="animate-fade-up space-y-6">
      {/* Sticky window toolbar. */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ledger window · {WINDOW_LABELS[timeWindow]}
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

      {/* HERO — IFRS 15 liability facts from the live points ledger. */}
      <DynamicBanner
        page="ifrs"
        filters={filters}
        kicker={`IFRS 15 · Quarterly close · ${Q.quarter}`}
        fallbackHeadline={`${Q.quarter} · Net change ${net >= 0 ? '+' : ''}${formatAEDCompact(net)} · closing ${formatAEDCompact(Q.closing_liability_aed)}`}
        fallbackSubtitle="Every figure ties back to points_liability_daily. Opening → issued → redeemed → breakage release → closing."
        polish
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-[#F9C349] text-[#0F1120] hover:bg-[#fbd06a]"
          onClick={exportBrief}
        >
          <Download className="h-3.5 w-3.5" />
          Export audit brief
        </Button>
        <Badge variant="outline">
          Sensitivity 1 pp = {formatAEDCompact(Q.sensitivity_1pp)}
        </Badge>
      </div>

      <PageAiSummary
        queryKey={['ifrs-insights']}
        loader={() => api.insightsHome(filters)}
        pageTitle="IFRS 15 Liability"
        emailStats={{
          Window: WINDOW_LABELS[timeWindow],
          Quarter: Q.quarter,
          'Opening liability': formatAEDCompact(Q.opening_liability_aed),
          'Points issued': formatAEDCompact(Q.points_issued_aed),
          'Points redeemed': formatAEDCompact(Q.points_redeemed_aed),
          'Breakage release': formatAEDCompact(Q.breakage_release_aed),
          'Closing liability': formatAEDCompact(Q.closing_liability_aed),
          'Net change': `${net >= 0 ? '+' : ''}${formatAEDCompact(net)} (${netPct.toFixed(1)}%)`,
          'Sensitivity (1pp)': formatAEDCompact(Q.sensitivity_1pp),
          'Expiring 90d — members': aging ? formatInt(aging.expiring_90d.member_count) : '—',
          'Expiring 90d — AED': aging ? formatAEDCompact(aging.expiring_90d.liability_aed) : '—',
        }}
        exportRows={
          aging
            ? [
                {
                  sheetName: 'Aging buckets',
                  rows: aging.buckets.map((b) => ({
                    'Age bucket': b.age_bucket,
                    'Liability (AED)': Math.round(b.liability_aed),
                    'Expected redemption (AED)': Math.round(b.expected_redemption_aed),
                    'Expected breakage (AED)': Math.round(b.expected_breakage_aed),
                    'Uncommitted (AED)': Math.round(b.uncommitted_aed),
                    'Breakage lo (AED)': Math.round(b.breakage_lo_aed),
                    'Breakage hi (AED)': Math.round(b.breakage_hi_aed),
                  })),
                },
                {
                  sheetName: 'Expiring 90d summary',
                  rows: [
                    {
                      'Members at risk': aging.expiring_90d.member_count,
                      'Liability (AED)': Math.round(aging.expiring_90d.liability_aed),
                      'Sample CSV URL': aging.expiring_90d.sample_csv_url,
                      'Breakage mean': aging.breakage_mean,
                      'Breakage stdev': aging.breakage_stdev,
                      'Total liability (AED)': Math.round(aging.total_liability_aed),
                    },
                  ],
                },
              ]
            : undefined
        }
      />

      {/* Waterfall */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liability waterfall — {Q.quarter}</CardTitle>
        </CardHeader>
        <CardContent>
          <WaterfallChart data={waterfall} />
        </CardContent>
      </Card>

      {/* Line detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line-item detail</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">AED</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waterfall.map((w) => (
                <TableRow key={w.label}>
                  <TableCell className="font-medium">{w.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAEDCompact(Math.abs(w.value))}</TableCell>
                  <TableCell>
                    {w.kind === 'start' || w.kind === 'end' ? (
                      <Badge variant="outline">balance</Badge>
                    ) : w.kind === 'up' ? (
                      <span className="inline-flex items-center gap-1 text-sm text-rose-700">
                        <TrendingUp className="h-3.5 w-3.5" /> increase
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                        <TrendingDown className="h-3.5 w-3.5" /> decrease
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.kind === 'start'
                      ? 'Pulled from prior-quarter close balance.'
                      : w.kind === 'end'
                        ? `= Opening + Issued − Redeemed − Breakage release.`
                        : w.kind === 'up'
                          ? 'New Nexus earned at 1:1 per AED revenue.'
                          : w.label.includes('Breakage')
                            ? 'Release of breakage against expected-value estimate.'
                            : 'Redemption at 200 Nexus per AED.'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Liability Aging Waterfall — NEW */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liability Aging Waterfall</CardTitle>
            <p className="text-sm text-muted-foreground">
              Outstanding Nexus liability bucketed by age. Stacked composition shows
              expected redemption (gold), breakage release (navy), and uncommitted balance.
              Error bars trace the Monte-Carlo breakage envelope (mean {aging
                ? `${(aging.breakage_mean * 100).toFixed(0)}%`
                : '25%'} ± {aging ? `${(aging.breakage_stdev * 100).toFixed(0)}` : '5'} pp).
            </p>
          </CardHeader>
          <CardContent>
            {agingQuery.isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <NexusLoader label="Scoring outstanding Nexus…" />
              </div>
            ) : agingQuery.isError ? (
              <div className="p-6 text-sm text-rose-700">
                Failed to load aging buckets. Check API.
              </div>
            ) : aging && aging.buckets.length > 0 ? (
              <AgingWaterfallChart buckets={aging.buckets} />
            ) : (
              <p className="text-sm text-muted-foreground">No outstanding liability in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              90-Day Expiry Alert
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Members whose oldest Nexus cross the 24-month expiry inside 90 days.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {agingQuery.isLoading ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            ) : aging ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Members at risk
                    </p>
                    <p className="font-display text-2xl font-semibold tabular-nums text-amber-900">
                      {formatInt(aging.expiring_90d.member_count)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Liability AED
                    </p>
                    <p className="font-display text-2xl font-semibold tabular-nums text-amber-900">
                      {formatAEDCompact(aging.expiring_90d.liability_aed)}
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  type="button"
                  size="sm"
                  className="w-full bg-[#F9C349] text-[#0F1120] hover:bg-[#fbd06a]"
                >
                  <a
                    href={api.ifrsExpiringCsvUrl(filters)}
                    download="nexus-expiring-90d.csv"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download expiring members CSV
                  </a>
                </Button>
                <p className="text-xs text-amber-900">
                  Reactivation play: trigger an email campaign at the 120-day mark.
                  Observed conversion ~24% uplifts burn-rate before the 24-month wall.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditor notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-foreground">
            {Q.notes.map((n) => (
              <li key={n} className="leading-relaxed">
                {n}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function WaterfallChart({
  data,
}: {
  data: Array<{ label: string; value: number; kind: 'start' | 'up' | 'down' | 'end' }>;
}) {
  // Compute running totals for bar placement
  const items = data.map((d, i) => {
    if (d.kind === 'start' || d.kind === 'end') {
      return { ...d, from: 0, to: Math.abs(d.value) };
    }
    const prev = data.slice(0, i).reduce((acc, row) => {
      if (row.kind === 'start') return Math.abs(row.value);
      if (row.kind === 'end') return acc;
      return acc + row.value;
    }, 0);
    const next = prev + d.value;
    return { ...d, from: Math.min(prev, next), to: Math.max(prev, next) };
  });

  const max = Math.max(...items.map((d) => d.to)) * 1.1;
  const H = 240;
  const W = 100;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W * items.length + 10} ${H + 30}`}
        className="h-auto w-full"
        role="img"
        aria-label="Liability waterfall chart"
      >
        {items.map((d, i) => {
          const barWidth = 60;
          const x = i * W + (W - barWidth) / 2;
          const yTop = H - (d.to / max) * H;
          const yBottom = H - (d.from / max) * H;
          const height = Math.max(2, yBottom - yTop);
          const fill =
            d.kind === 'start' || d.kind === 'end'
              ? '#0F1120'
              : d.kind === 'up'
                ? '#fb7185'
                : '#34d399';
          return (
            <g key={d.label}>
              <rect x={x} y={yTop} width={barWidth} height={height} rx={2} fill={fill} fillOpacity={0.85} />
              <text
                x={x + barWidth / 2}
                y={yTop - 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="#0F1120"
              >
                {formatAEDCompact(Math.abs(d.value))}
              </text>
              <text
                x={x + barWidth / 2}
                y={H + 12}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
              >
                {d.label}
              </text>
              {i < items.length - 1 && d.kind !== 'end' ? (
                <line
                  x1={x + barWidth}
                  y1={yTop}
                  x2={(i + 1) * W + (W - barWidth) / 2}
                  y2={yTop}
                  stroke="#9ca3af"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Liability Aging Waterfall (NEW) ──────────────────────────────
// Stacked bar per age bucket: expected_redemption (gold) +
// expected_breakage (navy) + uncommitted (muted). Error bars trace the
// Monte Carlo breakage envelope.

const AGING_COLORS = {
  redemption: '#F9C349',
  breakage: '#0F1120',
  uncommitted: '#CBD5E1',
};

interface AgingRow {
  bucket: string;
  redemption: number;
  breakage: number;
  uncommitted: number;
  breakageLo: number;
  breakageHi: number;
  total: number;
}

function AgingWaterfallChart({ buckets }: { buckets: IfrsAgingBucket[] }) {
  const data: AgingRow[] = buckets.map((b) => ({
    bucket: b.age_bucket,
    redemption: b.expected_redemption_aed,
    breakage: b.expected_breakage_aed,
    uncommitted: b.uncommitted_aed,
    breakageLo: b.expected_breakage_aed - b.breakage_lo_aed,
    breakageHi: b.breakage_hi_aed - b.expected_breakage_aed,
    total: b.liability_aed,
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 24, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 12, fill: '#374151' }}
            label={{
              value: 'Age bucket',
              position: 'insideBottom',
              offset: -4,
              fontSize: 11,
              fill: '#6b7280',
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v: number) => formatAEDCompact(v)}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatAEDCompact(value), name]}
            labelFormatter={(label: string) => `Age ${label}`}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="redemption"
            stackId="a"
            name="Expected redemption"
            fill={AGING_COLORS.redemption}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="breakage"
            stackId="a"
            name="Expected breakage"
            fill={AGING_COLORS.breakage}
            fillOpacity={0.88}
          >
            <ErrorBar
              dataKey={(d: AgingRow) => [d.breakageLo, d.breakageHi]}
              stroke="#6b7280"
              strokeWidth={1.5}
              width={6}
            />
          </Bar>
          <Bar
            dataKey="uncommitted"
            stackId="a"
            name="Uncommitted"
            fill={AGING_COLORS.uncommitted}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
