'use client';

import { BarChart2, TrendingDown, TrendingUp } from 'lucide-react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { BENCHMARKS_DEMO } from '@/lib/demo-data';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

export default function BenchmarksPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:benchmarks', 'all');
  const wins = BENCHMARKS_DEMO.filter((b) => isWinning(b)).length;
  const losses = BENCHMARKS_DEMO.length - wins;
  const peerSamples = BENCHMARKS_DEMO.reduce((sum, b) => sum + b.peers_n, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
          </span>
          <div className="flex flex-col items-end gap-1">
            <WindowSelector value={timeWindow} onChange={setWindow} />
            {dataAnchor && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Anchored to <span className="font-mono text-foreground">{dataAnchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <DynamicBanner
        page="benchmarks"
        filters={windowFilters}
        kicker="Peer Benchmarks · MENA coalitions"
        fallbackHeadline="How does Nexus rank against Shukran, SHARE, Smiles?"
        fallbackSubtitle="Anonymised comparison against 9-11 MENA coalition loyalty peers — quartile bands show where Nexus sits in the distribution; median marker shows the gap to close."
        variant="light"
        polish
      />

      <PageAiSummary
        queryKey={['benchmarks-insights']}
        loader={() => api.insightsHome(windowFilters)}
        pageTitle="Peer Benchmarks"
        emailStats={{
          'Metrics tracked': `${BENCHMARKS_DEMO.length}`,
          'Ahead of median': `${wins}`,
          'Lagging median': `${losses}`,
          'Peer sample': `n=${peerSamples}`,
          Refresh: 'Quarterly',
        }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <BarChart2 className="h-3.5 w-3.5" /> Peer benchmarks · MENA coalition cohort
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {wins} metrics ahead of peer median · {losses} lagging
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            Anonymous comparison against 9-11 MENA coalition loyalty peers (SHARE, ADCB Touchpoints, Lulu, Skywards-adjacent, Careem Rewards, etc). Quartile bands show where Nexus sits in the distribution.
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {BENCHMARKS_DEMO.map((b) => (
          <BenchmarkCard key={b.metric} b={b} />
        ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Peer data sourced from anonymized industry benchmarks (MENA Loyalty Summit 2025 baseline dataset, n=11). Refreshed quarterly.
      </p>
    </div>
  );
}

type B = typeof BENCHMARKS_DEMO[number];

function isWinning(b: B): boolean {
  return b.direction === 'higher_better' ? b.nexus >= b.peer_median : b.nexus <= b.peer_median;
}

function BenchmarkCard({ b }: { b: B }) {
  const winning = isWinning(b);
  const Arrow = winning ? TrendingUp : TrendingDown;
  const colour = winning ? 'text-emerald-600' : 'text-amber-600';

  // Normalize Nexus position along the p25-p75 range visually
  const range = Math.max(b.peer_p75 - b.peer_p25, 1e-6);
  const nexusPos = Math.max(0, Math.min(1, (b.nexus - b.peer_p25) / range));
  const medianPos = Math.max(0, Math.min(1, (b.peer_median - b.peer_p25) / range));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{b.metric}</CardTitle>
          <Badge variant={winning ? 'success' : 'warning'} className="ml-auto">
            {winning ? 'AHEAD' : 'BEHIND'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{b.note}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Numeric comparison */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Pill label="P25" value={b.peer_p25} unit={b.unit} muted />
          <Pill
            label="Median"
            value={b.peer_median}
            unit={b.unit}
            outline
          />
          <Pill label="P75" value={b.peer_p75} unit={b.unit} muted />
        </div>

        {/* Rail */}
        <div className="relative h-3 w-full rounded-full bg-muted">
          <div
            className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-emerald-200 via-white to-emerald-200"
            style={{
              left: `${Math.min(nexusPos, medianPos) * 100}%`,
              width: `${Math.abs(nexusPos - medianPos) * 100}%`,
            }}
            aria-hidden
          />
          {/* Median marker */}
          <div
            className="absolute top-0 h-3 w-0.5 bg-foreground"
            style={{ left: `${medianPos * 100}%` }}
            aria-hidden
            title="Peer median"
          />
          {/* Nexus marker */}
          <div
            className={
              'absolute -top-1 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white shadow-md ' +
              (winning ? 'bg-emerald-500' : 'bg-amber-500')
            }
            style={{ left: `${nexusPos * 100}%` }}
            aria-label={`Nexus position: ${b.nexus} ${b.unit}`}
            title={`Nexus: ${b.nexus} ${b.unit}`}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Nexus:{' '}
            <span className={`font-semibold tabular-nums ${colour}`}>
              {b.nexus} {b.unit}
            </span>
          </span>
          <span className={`inline-flex items-center gap-1 ${colour}`}>
            <Arrow className="h-3.5 w-3.5" />
            {b.direction === 'higher_better'
              ? `${(((b.nexus - b.peer_median) / b.peer_median) * 100).toFixed(0)}% vs median`
              : `${(((b.peer_median - b.nexus) / b.peer_median) * 100).toFixed(0)}% better than median`}
          </span>
          <span className="text-muted-foreground">n = {b.peers_n} peers</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Pill({
  label,
  value,
  unit,
  muted,
  outline,
}: {
  label: string;
  value: number;
  unit: string;
  muted?: boolean;
  outline?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg px-2 py-1.5 ' +
        (outline
          ? 'border border-[#DA9712] bg-[#FDF5E0]'
          : muted
            ? 'bg-muted/30'
            : 'bg-muted/30')
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-base font-semibold tabular-nums">
        {value}
        <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
