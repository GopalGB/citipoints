'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ChartShell } from '@/components/charts/chart-shell';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAED } from '@/lib/format';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const PERSONA_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'default'> = {
  Champions: 'success',
  Loyal: 'primary',
  'Potential Loyalists': 'primary',
  'New Customers': 'default',
  'At Risk': 'danger',
  Hibernating: 'warning',
  Lost: 'warning',
  'Needs Nurture': 'default',
};

export default function SegmentsPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:segments',
    'all',
  );
  const rfmQuery = useQuery({ queryKey: ['rfm'], queryFn: () => api.rfm() });
  const migrationQuery = useQuery({
    queryKey: ['tier-migration', timeWindow],
    queryFn: () => api.tierMigration(filters),
  });

  const personaEntries = Object.entries(rfmQuery.data?.persona_counts ?? {})
    .sort(([, a], [, b]) => b - a);

  // ── Dynamic headline ─────────────────────────────────────────
  const totalMembers = personaEntries.reduce((acc, [, c]) => acc + c, 0);
  const topPersona = personaEntries[0];
  const atRiskBuckets = ['At Risk', 'Hibernating', 'Lost', 'Needs Nurture'];
  const atRiskCount = personaEntries
    .filter(([p]) => atRiskBuckets.includes(p))
    .reduce((acc, [, c]) => acc + c, 0);

  const headline = topPersona
    ? `${topPersona[1].toLocaleString('en-US')} ${topPersona[0]} lead the base · ${atRiskCount.toLocaleString('en-US')} at-risk to reactivate`
    : 'Which Nexus members should we target — and with what offer?';

  const subtitle = totalMembers
    ? `${totalMembers.toLocaleString('en-US')} members across ${personaEntries.length} personas · silhouette ${
        rfmQuery.data?.silhouette_score?.toFixed(2) ?? '—'
      }. RFM + KMeans clusters on recency / frequency / monetary; At-Risk + Hibernating hold the breakage liability.`
    : 'A CMO + data-science view. RFM quintiles on recency / frequency / monetary, clustered with KMeans into 8 behavioural personas.';

  const emailStats: Record<string, string> = {
    'Total members': totalMembers.toLocaleString('en-US'),
    Personas: `${personaEntries.length}`,
    'At-risk members': atRiskCount.toLocaleString('en-US'),
    'Silhouette score': rfmQuery.data?.silhouette_score?.toFixed(3) ?? '—',
  };
  if (topPersona) {
    emailStats['Largest persona'] = `${topPersona[0]} (${topPersona[1].toLocaleString('en-US')})`;
  }

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
        page="segments"
        filters={filters}
        kicker="Member segments · RFM + KMeans + Repeat"
        fallbackHeadline={headline}
        fallbackSubtitle={subtitle}
        variant="light"
        polish
      />

      <PageAiSummary
        queryKey={['segment-insights']}
        loader={() => api.segmentInsights()}
        pageTitle="Segments · RFM · Repeat"
        emailStats={emailStats}
      />

      <div className="grid auto-rows-fr gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Persona distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {rfmQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-4">
                {personaEntries.map(([persona, count]) => (
                  <div
                    key={persona}
                    className="flex min-h-[112px] flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <Badge variant={PERSONA_COLORS[persona] ?? 'default'} className="w-fit">
                      {persona}
                    </Badge>
                    <span className="font-display text-2xl font-semibold tabular-nums">
                      {count.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs text-muted-foreground">members</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Silhouette score</span>
              <span className="font-semibold tabular-nums">
                {rfmQuery.data?.silhouette_score?.toFixed(3) ?? '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Values closer to 1.0 mean tighter, better-separated clusters. Silhouette is
              computed on standardised Recency/Frequency/Monetary features.
            </p>
          </CardContent>
        </Card>
      </div>

      <ChartShell
        id="segments-persona-grid"
        title="RFM sample"
        description="First 25 customers — sortable in the full build"
        height="auto"
      >
        {rfmQuery.data?.segments?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Recency (days)</TableHead>
                <TableHead className="text-right">Frequency</TableHead>
                <TableHead className="text-right">Monetary</TableHead>
                <TableHead className="text-right">Cluster</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfmQuery.data.segments.slice(0, 25).map((row) => (
                <TableRow key={row.customer_id}>
                  <TableCell className="font-mono text-xs">{row.customer_id}</TableCell>
                  <TableCell>
                    <Badge variant={PERSONA_COLORS[row.segment] ?? 'default'}>{row.segment}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.recency}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.frequency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAED(row.monetary)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.predicted_cluster}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </ChartShell>

      <Card>
        <CardHeader>
          <CardTitle>Tier migration (last half vs first half)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Approximate Sankey source data — who moved up, who fell back.
          </p>
        </CardHeader>
        <CardContent>
          {migrationQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source tier</TableHead>
                  <TableHead>Target tier</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {migrationQuery.data.map((edge) => (
                  <TableRow key={`${edge.source_tier}->${edge.target_tier}`}>
                    <TableCell>{edge.source_tier}</TableCell>
                    <TableCell>{edge.target_tier}</TableCell>
                    <TableCell className="text-right tabular-nums">{edge.members}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
