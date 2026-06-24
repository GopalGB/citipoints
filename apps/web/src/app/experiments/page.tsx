'use client';

import { AlertTriangle, CheckCircle2, CircleDot, FlaskConical, Pause, XCircle } from 'lucide-react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
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
import { EXPERIMENTS_DEMO, type Experiment } from '@/lib/demo-data';
import { formatInt } from '@/lib/format';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const STATUS_ICON: Record<Experiment['status'], { icon: typeof CircleDot; cls: string; label: string }> = {
  running: { icon: CircleDot, cls: 'text-sky-500', label: 'Running' },
  completed: { icon: CheckCircle2, cls: 'text-emerald-600', label: 'Completed' },
  paused: { icon: Pause, cls: 'text-amber-500', label: 'Paused' },
  stopped_early: { icon: XCircle, cls: 'text-rose-500', label: 'Stopped early' },
};

const VERDICT_TONE: Record<Experiment['verdict'], 'success' | 'warning' | 'danger' | 'primary'> = {
  shipped: 'success',
  killed: 'danger',
  inconclusive: 'warning',
  pending: 'primary',
};

export default function ExperimentsPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:experiments', 'all');
  const running = EXPERIMENTS_DEMO.filter((e) => e.status === 'running').length;
  const shipped = EXPERIMENTS_DEMO.filter((e) => e.verdict === 'shipped').length;
  const killed = EXPERIMENTS_DEMO.filter((e) => e.verdict === 'killed').length;
  const srmFailed = EXPERIMENTS_DEMO.filter((e) => e.srm_p < 0.05).length;
  const avgLift =
    EXPERIMENTS_DEMO.length > 0
      ? EXPERIMENTS_DEMO.reduce((sum, e) => sum + e.lift_pct, 0) / EXPERIMENTS_DEMO.length
      : 0;

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
        page="experiments"
        filters={windowFilters}
        kicker="Experiments · A/B ledger + causal lift"
        fallbackHeadline="Which experiments moved the needle?"
        fallbackSubtitle="Every A/B with a 10% auto-holdout, SRM sanity-check, sequential stopping rule, and causal-lift readout. Kill-decisions logged; every shipped lift feeds forecast and model retraining."
        variant="light"
        polish
      />

      <PageAiSummary
        queryKey={['experiments-insights']}
        loader={() => api.insightsHome(windowFilters)}
        pageTitle="Experiments"
        emailStats={{
          Total: `${EXPERIMENTS_DEMO.length}`,
          Running: `${running}`,
          Shipped: `${shipped}`,
          Killed: `${killed}`,
          'SRM flagged': `${srmFailed}`,
          'Avg lift': `${avgLift.toFixed(1)}%`,
        }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <FlaskConical className="h-3.5 w-3.5" /> A/B experiments · causal ledger
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {running} running · {shipped} shipped · {killed} killed · {srmFailed} SRM-flagged
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            Every experiment with 10% auto-holdout, SRM sanity-check, sequential stopping rule, and causal-lift readout. Kill-decisions logged. Every shipped lift feeds forecast and model retraining.
          </p>
        </div>
      </section>

      {/* Summary tiles */}
      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Running" value={running} icon={CircleDot} tone="primary" />
        <Tile label="Shipped" value={shipped} icon={CheckCircle2} tone="success" />
        <Tile label="Killed" value={killed} icon={XCircle} tone="danger" />
        <Tile label="SRM flags" value={srmFailed} icon={AlertTriangle} tone="warning" />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Experiment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Treatment N</TableHead>
                <TableHead className="text-right">Control N</TableHead>
                <TableHead className="text-right">Lift</TableHead>
                <TableHead className="text-right">95% CI</TableHead>
                <TableHead className="text-right">p</TableHead>
                <TableHead>SRM</TableHead>
                <TableHead>Stop rule</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EXPERIMENTS_DEMO.map((e) => {
                const { icon: Icon, cls, label } = STATUS_ICON[e.status];
                const srmOk = e.srm_p >= 0.05;
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {e.id} · {e.primary_metric}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(e.treatment_n)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(e.control_n)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={e.lift_pct >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                        {e.lift_pct >= 0 ? '+' : ''}
                        {e.lift_pct.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      [{e.ci_low.toFixed(1)}, {e.ci_high.toFixed(1)}]
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.p_value.toFixed(3)}</TableCell>
                    <TableCell>
                      <Badge variant={srmOk ? 'success' : 'danger'} className="text-[10px]">
                        p={e.srm_p.toFixed(2)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {e.sequential_stop ?? 'none'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={VERDICT_TONE[e.verdict]}>{e.verdict.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.owner}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="rounded-md border border-dashed border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
        <span className="font-semibold">SRM sanity check:</span> any experiment where the observed sample ratio differs from target at p &lt; 0.05 gets paused automatically. Prevents "hidden-bucket" fallacies that inflate false-positive rates.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CircleDot;
  tone: 'primary' | 'success' | 'danger' | 'warning';
}) {
  const bg: Record<typeof tone, string> = {
    primary: 'border-[#F9C349]/40 bg-[#FDF5E0]/60',
    success: 'border-emerald-200 bg-emerald-50/60',
    danger: 'border-rose-200 bg-rose-50/60',
    warning: 'border-amber-200 bg-amber-50/60',
  };
  return (
    <Card className={bg[tone]}>
      <CardContent className="flex items-center gap-3 pt-4">
        <Icon className="h-5 w-5 text-foreground/60" aria-hidden />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
