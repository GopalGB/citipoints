'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { AnomalySeriesChart } from '@/components/anomaly/anomaly-series-chart';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const ExplainAnomalyModal = dynamic(
  () => import('@/components/anomaly/explain-anomaly-modal').then((m) => m.ExplainAnomalyModal),
  { ssr: false },
);
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAED, formatCompact } from '@/lib/format';
import { api } from '@/lib/api';
import type { AnomalyPoint } from '@/lib/types';

export default function AnomalyPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:anomaly',
    'all',
  );
  const { data, isLoading } = useQuery({
    queryKey: ['anomaly-daily', timeWindow],
    queryFn: () => api.anomaly(2.5, filters),
  });

  const anomalies = (data ?? []).filter((p) => p.is_anomaly);
  const [selected, setSelected] = useState<AnomalyPoint | null>(null);

  // ── Dynamic headline ─────────────────────────────────────────
  const spikes = anomalies.filter((p) => (p.residual ?? 0) > 0).length;
  const dips = anomalies.filter((p) => (p.residual ?? 0) < 0).length;
  const biggest = anomalies.length
    ? anomalies.reduce((acc, p) =>
        Math.abs(p.residual ?? 0) > Math.abs(acc.residual ?? 0) ? p : acc,
      )
    : null;

  const dynamicHeadline = isLoading
    ? 'Scanning the daily revenue series…'
    : !data?.length
      ? 'No revenue rows yet — the warehouse is still warming up.'
      : anomalies.length === 0
        ? `No anomalies in ${WINDOW_LABELS[timeWindow]} — revenue tracked its own seasonality.`
        : `${anomalies.length} anomaly day${anomalies.length === 1 ? '' : 's'} in ${WINDOW_LABELS[timeWindow]} · ${spikes} spike${spikes === 1 ? '' : 's'} · ${dips} dip${dips === 1 ? '' : 's'}${
            biggest
              ? ` · biggest on ${biggest.date} (${(biggest.residual ?? 0) >= 0 ? '+' : '−'}AED ${Math.abs(biggest.residual ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })})`
              : ''
          }.`;

  return (
    <div className="animate-fade-up space-y-6">
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
      <DynamicBanner
        page="anomaly"
        filters={filters}
        kicker="Anomaly detection · STL residuals (robust)"
        fallbackHeadline={dynamicHeadline}
        fallbackSubtitle="An operations + CFO anomaly view. Daily revenue is decomposed into trend + weekly seasonality; days where the residual exceeds 2.5σ get flagged."
        variant="light"
        polish
      />

      <AnomalySeriesChart
        data={data}
        isLoading={isLoading}
        onAnomalyClick={(p) => setSelected(p)}
      />
      {/* anomaly-series anchor retained for insight "see evidence" links */}
      <span id="anomaly-series" aria-hidden className="sr-only" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-danger" />
            <CardTitle>Flagged days</CardTitle>
            <Badge variant="danger" className="ml-2">
              {anomalies.length} {anomalies.length === 1 ? 'anomaly' : 'anomalies'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No statistically significant anomalies in the current window. Revenue is tracking
              its trend + weekly seasonality.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Residual</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>AI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.map((p) => (
                  <TableRow key={p.date}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(p.date), 'EEE, MMM d yyyy')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAED(p.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAED(p.expected)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${p.residual > 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {p.residual > 0 ? '+' : ''}
                      {formatAED(p.residual)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.reason}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(p)}
                      >
                        <Sparkles className="h-3 w-3" />
                        Explain
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExplainAnomalyModal
        open={selected != null}
        point={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
