'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon,
  CheckCircle2,
  Network,
  ShieldAlert,
  Snowflake,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { RingGraph } from '@/components/fraud/ring-graph';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatAED, formatAEDCompact } from '@/lib/format';
import type {
  FraudFlag,
  FraudGraphPattern,
  FraudKind,
  FraudRing,
  FraudSeverity,
} from '@/lib/types';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

type LocalStatus = 'open' | 'confirmed_fraud' | 'false_positive';

const KIND_LABEL: Record<FraudKind, string> = {
  velocity: 'Velocity',
  bulk_redeem: 'Bulk redeem',
  tier_farming: 'Tier farming',
  partner_collision: 'Partner collision',
  redeem_abuse: 'Redeem abuse',
};

const SEV_TONE: Record<FraudSeverity, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

const STATUS_ICON: Record<
  LocalStatus,
  { icon: typeof CheckCircle2; cls: string }
> = {
  open: { icon: AlertOctagon, cls: 'text-amber-600' },
  confirmed_fraud: { icon: XCircle, cls: 'text-rose-600' },
  false_positive: { icon: CheckCircle2, cls: 'text-emerald-600' },
};

const PATTERN_LABEL: Record<FraudGraphPattern, string> = {
  'point-laundering': 'Point laundering',
  'device-sharing': 'Device sharing',
  'velocity-ring': 'Velocity ring',
};

const PATTERN_TONE: Record<FraudGraphPattern, 'danger' | 'warning' | 'primary'> = {
  'point-laundering': 'danger',
  'device-sharing': 'warning',
  'velocity-ring': 'primary',
};

export default function FraudPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:fraud',
    'all',
  );
  const [localStatus, setLocalStatus] = useState<Record<string, LocalStatus>>({});
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fraud-flags', timeWindow],
    queryFn: () => api.fraudFlags(filters),
  });

  const graphQuery = useQuery({
    queryKey: ['fraud-graph', timeWindow, filters.date_from, filters.date_to],
    queryFn: () =>
      api.fraudGraph({
        date_from: filters.date_from,
        date_to: filters.date_to,
        min_ring_size: 3,
      }),
  });

  const flags: FraudFlag[] = data?.flags ?? [];
  const getStatus = (id: string): LocalStatus => localStatus[id] ?? 'open';
  const mark = (id: string, status: LocalStatus) =>
    setLocalStatus((prev) => ({ ...prev, [id]: status }));

  const counts = useMemo(() => {
    const open = flags.filter((f) => getStatus(f.id) === 'open').length;
    const confirmed = flags.filter((f) => getStatus(f.id) === 'confirmed_fraud').length;
    const falsePos = flags.filter((f) => getStatus(f.id) === 'false_positive').length;
    return { open, confirmed, falsePos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, localStatus]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Toolbar — sticky so the window selector is always available */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Scan window · {WINDOW_LABELS[timeWindow]}
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

      {/* HERO — live fraud headline from the scanner. */}
      <DynamicBanner
        page="fraud"
        filters={filters}
        kicker="Cross-partner fraud scanner"
        fallbackHeadline={
          isLoading
            ? 'Scanning…'
            : isError
              ? 'Scan failed — retry once the warehouse is warm.'
              : (data?.headline.text ?? 'No signals.')
        }
        fallbackSubtitle="Rule-based anomaly detection across partner redemption traffic — velocity, bulk-redemption, partner-collision, tier-farming. Computing flags from the warehouse…"
        polish
      />

      <PageAiSummary
        queryKey={['fraud-insights', timeWindow]}
        loader={() => api.insightsHome(filters)}
        pageTitle="Fraud Scanner"
        emailStats={{
          Window: WINDOW_LABELS[timeWindow],
          'Total flags': String(data?.total_flags ?? 0),
          'High severity': String(data?.high_severity ?? 0),
          'Medium severity': String(data?.medium_severity ?? 0),
          'Exposure (AED)': formatAED(data?.exposure_aed ?? 0),
          Open: String(counts.open),
          'Confirmed fraud': String(counts.confirmed),
          'False positive': String(counts.falsePos),
        }}
        exportRows={(() => {
          const sheets: { sheetName: string; rows: Record<string, unknown>[] }[] = [];
          if (flags.length > 0) {
            sheets.push({
              sheetName: 'Flagged transactions',
              rows: flags.map((f) => ({
                'Flag ID': f.id,
                Member: f.member,
                Detected: f.detected_on,
                Kind: KIND_LABEL[f.kind] ?? f.kind,
                Severity: f.severity.toUpperCase(),
                Score: f.score,
                Explanation: f.explanation,
                'Loss (AED)': Math.round(f.loss_aed),
                Status: getStatus(f.id),
              })),
            });
          }
          const rings = graphQuery.data?.rings ?? [];
          if (rings.length > 0) {
            sheets.push({
              sheetName: 'Fraud rings',
              rows: rings.map((r) => ({
                'Ring ID': r.ring_id,
                Pattern: PATTERN_LABEL[r.pattern],
                'Risk score': r.risk_score,
                PageRank: r.community_pagerank,
                'First seen': r.first_seen,
                Members: r.members.length,
                Merchants: r.merchants.length,
                'Txn (AED)': Math.round(r.total_txn_aed),
                'Member IDs': r.members.map((m) => m.member_id).join('; '),
                'Merchant IDs': r.merchants.map((m) => m.merchant).join('; '),
              })),
            });
          }
          return sheets.length > 0 ? sheets : undefined;
        })()}
      />

      {/* Summary tiles */}
      <div className="grid gap-3 md:grid-cols-4">
        <Summary
          label="Flags in window"
          value={data?.total_flags ?? 0}
          icon={AlertOctagon}
          tone="primary"
          loading={isLoading}
        />
        <Summary
          label="High severity"
          value={data?.high_severity ?? 0}
          icon={XCircle}
          tone="danger"
          loading={isLoading}
        />
        <Summary
          label="Medium severity"
          value={data?.medium_severity ?? 0}
          icon={ShieldAlert}
          tone="warning"
          loading={isLoading}
        />
        <Summary
          label="Exposure (AED)"
          value={data?.exposure_aed ?? 0}
          icon={ShieldAlert}
          tone="primary"
          isCurrency
          loading={isLoading}
        />
      </div>

      {/* Kind breakdown */}
      {data && Object.keys(data.kind_breakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Flag kind breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.kind_breakdown).map(([kind, n]) => (
                <Badge key={kind} variant="outline" className="text-xs">
                  {KIND_LABEL[kind as FraudKind] ?? kind}: {n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flagged transactions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sort order: severity (HIGH → LOW) then score. Confirm / Dismiss updates local queue
            state for the demo; production wires to an audit log API.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <NexusLoader
              label="Scanning transaction anomalies"
              sublabel="velocity · bulk-redeem · partner-collision · tier-farming"
              height={220}
            />
          ) : flags.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No flags fired in <span className="font-medium">{WINDOW_LABELS[timeWindow]}</span>.
              Either the coalition is clean, or widen the window.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead className="text-right">Loss (AED)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((f) => {
                  const status = getStatus(f.id);
                  const { icon: Icon, cls } = STATUS_ICON[status];
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <p className="font-mono text-[11px] text-muted-foreground">{f.id}</p>
                        <p className="text-xs text-foreground">{f.member}</p>
                        <p className="text-[10px] text-muted-foreground">{f.detected_on}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {KIND_LABEL[f.kind] ?? f.kind}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {f.score.toFixed(2)}
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">
                        {f.explanation}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAED(f.loss_aed)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {status.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {status === 'open' ? (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => mark(f.id, 'confirmed_fraud')}
                            >
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => mark(f.id, 'false_positive')}
                            >
                              Dismiss
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                            onClick={() => mark(f.id, 'open')}
                          >
                            re-open
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="rounded-md border border-dashed border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        Detection engine: rule-based scans over the transactions table (velocity, bulk-redeem,
        partner-collision, tier-farming). Thresholds are tunable per partner. Phase-2 adds a
        supervised classifier + SHAP explanations once enough confirmed fraud is labelled.
      </p>

      {/* ─── Fraud Ring Graph (Graph-ML agent) ────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-nexus-navy" />
            <CardTitle>Fraud ring graph</CardTitle>
            <Badge variant="outline" className="ml-2 text-[10px]">
              networkx · greedy modularity + PageRank
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Members (gold circles) and merchants (navy squares) connected by shared
            transactions + synthesised device fingerprints. Communities ranked by risk score.
          </p>
        </CardHeader>
        <CardContent>
          {graphQuery.isLoading ? (
            <NexusLoader
              label="Building member-merchant-device graph"
              sublabel="greedy modularity · PageRank · pattern classifier"
              height={240}
            />
          ) : graphQuery.isError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
              Graph agent failed to run. Retry once the warehouse is warm.
            </div>
          ) : graphQuery.data ? (
            <div className="space-y-4">
              <GraphStats
                nodes={graphQuery.data.graph_stats.n_nodes}
                edges={graphQuery.data.graph_stats.n_edges}
                communities={graphQuery.data.graph_stats.n_communities}
                modularity={graphQuery.data.graph_stats.modularity}
              />
              {graphQuery.data.rings.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  No rings with at least 3 members in the scan window. Widen the window.
                </p>
              ) : (
                <div className="space-y-4">
                  {graphQuery.data.rings.map((ring) => (
                    <RingCard
                      key={ring.ring_id}
                      ring={ring}
                      onFreeze={(r) =>
                        setToast(
                          `Mock: ${r.members.length} accounts frozen, SAR draft generated for ${r.ring_id}`,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </CardContent>
      </Card>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[100] rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm shadow-pop"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{toast}</p>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GraphStats({
  nodes,
  edges,
  communities,
  modularity,
}: {
  nodes: number;
  edges: number;
  communities: number;
  modularity: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <StatChip label="Nodes" value={nodes.toLocaleString()} />
      <StatChip label="Edges" value={edges.toLocaleString()} />
      <StatChip label="Communities" value={communities.toLocaleString()} />
      <StatChip label="Modularity" value={modularity.toFixed(3)} />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-display text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RingCard({
  ring,
  onFreeze,
}: {
  ring: FraudRing;
  onFreeze: (ring: FraudRing) => void;
}) {
  const riskTone =
    ring.risk_score >= 60 ? 'bg-rose-500' : ring.risk_score >= 30 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-white p-4 md:grid-cols-[1.1fr_1fr]">
      <div>
        <RingGraph ring={ring} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{ring.ring_id}</span>
          <Badge variant={PATTERN_TONE[ring.pattern]}>{PATTERN_LABEL[ring.pattern]}</Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            first seen {ring.first_seen}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Risk score · {ring.risk_score.toFixed(1)}/100
          </p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${riskTone}`}
              style={{ width: `${Math.max(4, Math.min(100, ring.risk_score))}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="Members" value={String(ring.members.length)} />
          <StatChip label="Merchants" value={String(ring.merchants.length)} />
          <StatChip label="Txn AED" value={formatAEDCompact(ring.total_txn_aed)} />
          <StatChip label="PageRank" value={ring.community_pagerank.toFixed(4)} />
        </div>
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => onFreeze(ring)}
          >
            <Snowflake className="h-3.5 w-3.5" />
            Freeze + Draft SAR
          </Button>
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
  isCurrency,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: 'primary' | 'success' | 'danger' | 'warning';
  isCurrency?: boolean;
  loading?: boolean;
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
          {loading ? (
            <div className="mt-1 h-6 w-20 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <p className="font-display text-2xl font-semibold tabular-nums">
              {isCurrency ? formatAED(value) : value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
