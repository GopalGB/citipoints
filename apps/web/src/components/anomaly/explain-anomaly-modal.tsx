'use client';

import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatAED, formatAEDCompact } from '@/lib/format';
import type {
  AgentConfidence,
  AnomalyExplainResponse,
  AnomalyPoint,
  AnomalySuspect,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type Props = {
  point: AnomalyPoint | null;
  open: boolean;
  onClose: () => void;
};

const CONFIDENCE_TONE: Record<AgentConfidence, 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

const DIMENSION_COLOR: Record<'partner' | 'store' | 'region', string> = {
  partner: '#F9C349',
  store: '#4B4F73',
  region: '#60A5FA',
};

export function ExplainAnomalyModal({ point, open, onClose }: Props) {
  const [showSql, setShowSql] = useState(false);

  const explain = useMutation({
    mutationFn: (body: { date: string; deviation_pct: number }) =>
      api.anomalyExplain({
        date: body.date,
        metric: 'revenue',
        deviation_pct: body.deviation_pct,
      }),
  });

  // Auto-fire mutation when the modal opens on a fresh point.
  useEffect(() => {
    if (!open || !point) return;
    setShowSql(false);
    const deviationPct = point.expected
      ? ((point.revenue - point.expected) / point.expected) * 100
      : 0;
    explain.mutate({ date: point.date, deviation_pct: Number(deviationPct.toFixed(2)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, point?.date]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !point) return null;

  const response: AnomalyExplainResponse | undefined = explain.data;
  const isLoading = explain.isPending;
  const isError = explain.isError;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0F1120]/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Explain anomaly"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-nexus-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              <Sparkles className="h-3 w-3" /> Anomaly-Explain Agent · grounded in warehouse
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold">
              {point.date} · {formatAEDCompact(point.revenue)}
            </h2>
            <p className="mt-0.5 text-xs text-white/70">
              Expected {formatAEDCompact(point.expected)} · residual{' '}
              {point.residual >= 0 ? '+' : ''}
              {formatAEDCompact(point.residual)}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <NexusLoader
              label="Agent tracing the dip…"
              sublabel="ranking partner · store · region contributions"
              height={220}
            />
          ) : isError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
              Agent call failed. Retry — the warehouse or the CLI may be warming up.
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => {
                  const deviationPct = point.expected
                    ? ((point.revenue - point.expected) / point.expected) * 100
                    : 0;
                  explain.mutate({
                    date: point.date,
                    deviation_pct: Number(deviationPct.toFixed(2)),
                  });
                }}
              >
                Retry
              </Button>
            </div>
          ) : response ? (
            <ExplainContent
              response={response}
              showSql={showSql}
              onToggleSql={() => setShowSql((v) => !v)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExplainContent({
  response,
  showSql,
  onToggleSql,
}: {
  response: AnomalyExplainResponse;
  showSql: boolean;
  onToggleSql: () => void;
}) {
  const chartData = useMemo(
    () =>
      response.suspect_dimensions.map((s) => ({
        label: `${s.dimension.charAt(0).toUpperCase()}${s.dimension.slice(1)}: ${s.value}`,
        dimension: s.dimension,
        contribution: s.contribution_aed,
        pct: s.contribution_pct,
      })),
    [response.suspect_dimensions],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={CONFIDENCE_TONE[response.confidence]}>
          confidence {response.confidence}
        </Badge>
        {response.abstained ? (
          <Badge variant="outline">abstained · below 0.70 threshold</Badge>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#F9C349]/40 bg-[#FDF5E0] p-4">
        <p className="text-sm font-semibold text-foreground">{response.summary}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{response.root_cause}</p>
      </div>

      {chartData.length ? (
        <div className="rounded-xl border border-border bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Dimension contribution to deviation
          </p>
          <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 36)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 40, bottom: 0, left: 8 }}
            >
              <CartesianGrid horizontal={false} stroke="#E8E5DC" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatAEDCompact(v)}
                fontSize={10}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={180}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v: number | string) => [formatAED(Number(v)), 'Contribution']}
              />
              <Bar dataKey="contribution" radius={[0, 6, 6, 0]}>
                {chartData.map((row) => (
                  <Cell
                    key={row.label}
                    fill={DIMENSION_COLOR[row.dimension as keyof typeof DIMENSION_COLOR]}
                  />
                ))}
                <LabelList
                  dataKey="pct"
                  position="right"
                  formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  style={{ fontSize: 10, fill: '#1A1D33', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
          No dimension contributors ranked above noise — deviation is diffuse.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={onToggleSql}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          aria-expanded={showSql}
        >
          <ChevronDown
            className={cn('h-3 w-3 transition-transform', showSql ? '' : '-rotate-90')}
            aria-hidden
          />
          SQL used · {response.sql_used.length} chars
        </button>
        {showSql ? (
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-[#0F1120] p-3 font-mono text-[11px] leading-relaxed text-[#F9C349]">
            <code>{response.sql_used}</code>
          </pre>
        ) : null}
      </div>
    </>
  );
}
