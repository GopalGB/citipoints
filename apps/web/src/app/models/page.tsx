'use client';

import { BrainCircuit, CheckCircle2, Cpu, Database, RefreshCw, TrendingUp, Users } from 'lucide-react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { MODEL_CARDS } from '@/lib/demo-data';
import { formatInt } from '@/lib/format';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  yellow: 'bg-amber-50 border-amber-200 text-amber-700',
  red: 'bg-rose-50 border-rose-200 text-rose-700',
};

const STATUS_BADGE: Record<'green' | 'yellow' | 'red', 'success' | 'warning' | 'danger'> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
};

export default function ModelsPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:models', 'all');
  const stable = MODEL_CARDS.filter((m) => m.driftStatus === 'green').length;
  const watch = MODEL_CARDS.filter((m) => m.driftStatus === 'yellow').length;
  const alertCount = MODEL_CARDS.length - stable - watch;
  const totalFeatures = MODEL_CARDS.reduce((sum, m) => sum + m.features.length, 0);

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
        page="models"
        filters={windowFilters}
        kicker="Model Cards · ML transparency"
        fallbackHeadline="Are our models drifting?"
        fallbackSubtitle="Every ML model powering the dashboard — its algorithm, training data, holdout metrics, feature list, drift status. Built for Nexus's data council and external audit. No black boxes."
        variant="light"
        polish
      />

      <PageAiSummary
        queryKey={['models-insights']}
        loader={() => api.insightsHome(windowFilters)}
        pageTitle="Model Cards"
        emailStats={{
          'Production models': `${MODEL_CARDS.length}`,
          Stable: `${stable}`,
          Watch: `${watch}`,
          Alert: `${alertCount}`,
          'Total features tracked': `${totalFeatures}`,
        }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <BrainCircuit className="h-3.5 w-3.5" /> ML transparency · Model cards
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {MODEL_CARDS.length} production models · {MODEL_CARDS.filter((m) => m.driftStatus === 'green').length} stable · {MODEL_CARDS.filter((m) => m.driftStatus === 'yellow').length} watch
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            Every ML model powering the dashboard — its algorithm, training data, holdout metrics, feature list, drift status. Built for Nexus's data council + external audit. No black boxes.
          </p>
        </div>
      </section>

      {/* Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {MODEL_CARDS.map((m) => (
          <Card key={m.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Cpu className="h-4 w-4 text-[#DA9712]" />
                {m.name}
                <Badge variant={STATUS_BADGE[m.driftStatus]} className="ml-auto">
                  {m.driftStatus === 'green' ? 'STABLE' : m.driftStatus === 'yellow' ? 'WATCH' : 'ALERT'}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{m.id}</span> · {m.algorithm} · trained {m.trainedOn}
              </p>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
              {/* Training + holdout */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-muted/20 p-2">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Database className="h-3 w-3" /> Training rows
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold tabular-nums">
                    {formatInt(m.trainingRows)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-2">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Users className="h-3 w-3" /> Holdout rows
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold tabular-nums">
                    {m.holdoutRows > 0 ? formatInt(m.holdoutRows) : '—'}
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Holdout metrics
                </p>
                <ul className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(m.metrics).map(([k, v]) => (
                    <li
                      key={k}
                      className="flex items-baseline justify-between rounded-md bg-[#FDF5E0]/60 px-2 py-1"
                    >
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        {k}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {typeof v === 'number' && v < 1 && v > 0
                          ? v.toFixed(3)
                          : typeof v === 'number'
                            ? formatInt(v)
                            : String(v)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Metric history sparkline */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Primary-metric history (last 5 retrains)
                </p>
                <MetricSparkline values={[...m.aucHistory]} />
              </div>

              {/* Drift + features */}
              <div className={`rounded-lg border px-3 py-2 text-xs ${STATUS_STYLES[m.driftStatus]}`}>
                <p className="flex items-center gap-1 font-semibold">
                  <TrendingUp className="h-3 w-3" />
                  Drift · {m.driftStatus.toUpperCase()}
                </p>
                <p className="mt-1 leading-relaxed">{m.driftNote}</p>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Features ({m.features.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {m.features.map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  title="Production retrains run nightly on Airflow · this UI triggers an out-of-band rebuild"
                  onClick={() =>
                    alert(
                      `Retrain queued for ${m.name}. Production wires this to POST /models/${m.name}/retrain — the stub returns immediately.`,
                    )
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retrain
                </Button>
                <Badge variant="outline" className="text-[10px]">
                  Owner: {m.owner}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Audit footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log — last 5 retrains</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-xs">
            {MODEL_CARDS.map((m, i) => (
              <li
                key={`log-${m.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {m.trainedOn} · T-{i}h
                </span>
                <span className="font-medium">{m.name}</span>
                <Badge variant={STATUS_BADGE[m.driftStatus]} className="ml-auto text-[9px]">
                  PASSED
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? first;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-6);

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 28 - ((v - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');

  const trendUp = last >= first;
  const safeFirst = Math.max(Math.abs(first), 1e-6);
  const deltaPct = ((last - first) / safeFirst) * 100;

  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 100 32" className="h-8 w-32" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke={trendUp ? '#16a34a' : '#DA9712'}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-baseline gap-1 text-[11px]">
        <span className="font-semibold tabular-nums">
          {last < 1 && last > 0 ? last.toFixed(3) : last.toFixed(0)}
        </span>
        <span className="text-muted-foreground">
          ({trendUp ? '+' : ''}
          {deltaPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}
