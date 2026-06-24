'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BrainCircuit,
  Calendar,
  Coins,
  Crown,
  Layers,
  LifeBuoy,
  PackageSearch,
  RefreshCw,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { Insight, InsightBundle, InsightPriority } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  coins: Coins,
  calendar: Calendar,
  store: Store,
  crown: Crown,
  sparkles: Sparkles,
  layers: Layers,
  'life-buoy': LifeBuoy,
  award: Award,
  target: Target,
};

const PRIORITY_STYLES: Record<
  InsightPriority,
  {
    label: string;
    dot: string;
    border: string;
    chip: string;
    badge: 'primary' | 'success' | 'warning' | 'danger';
    order: number;
  }
> = {
  critical: {
    label: 'CRITICAL',
    dot: 'bg-rose-500',
    border: 'border-l-rose-500',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    badge: 'danger',
    order: 0,
  },
  warning: {
    label: 'WARNING',
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    badge: 'warning',
    order: 1,
  },
  opportunity: {
    label: 'OPPORTUNITY',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badge: 'success',
    order: 2,
  },
  info: {
    label: 'INFO',
    dot: 'bg-primary',
    border: 'border-l-primary',
    chip: 'bg-primary/10 text-primary border-primary/20',
    badge: 'primary',
    order: 3,
  },
};

type SourceKey = 'all' | 'overview' | 'predictive' | 'segments' | 'basket';
type PriorityFilter = 'all' | InsightPriority;

interface InsightSource {
  key: Exclude<SourceKey, 'all'>;
  label: string;
  icon: ComponentType<{ className?: string }>;
  queryKey: string[];
  fetch: () => Promise<InsightBundle>;
}

interface TaggedInsight extends Insight {
  source: Exclude<SourceKey, 'all'>;
  sourceLabel: string;
  question: string;
  generatedAt: string;
}

export default function InsightsPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:insights',
    '30d',
  );

  const queryClient = useQueryClient();

  const sources: InsightSource[] = useMemo(
    () => [
      {
        key: 'overview',
        label: 'Overview',
        icon: TrendingUp,
        queryKey: ['insights', 'home', JSON.stringify(filters)],
        fetch: () => api.insightsHome(filters),
      },
      {
        key: 'predictive',
        label: 'Predictive',
        icon: Target,
        queryKey: ['insights', 'predictive'],
        fetch: () => api.predictiveInsights(),
      },
      {
        key: 'segments',
        label: 'Segments',
        icon: Users,
        queryKey: ['insights', 'segments'],
        fetch: () => api.segmentInsights(),
      },
      {
        key: 'basket',
        label: 'Market Basket',
        icon: PackageSearch,
        queryKey: ['insights', 'basket'],
        fetch: () => api.basketInsights(),
      },
    ],
    [filters],
  );

  const queries = useQueries({
    queries: sources.map((src) => ({
      queryKey: src.queryKey,
      queryFn: src.fetch,
      staleTime: 60_000,
    })),
  });

  const isLoading = queries.some((q) => q.isPending);
  const isError = queries.some((q) => q.isError);

  const tagged: TaggedInsight[] = useMemo(() => {
    const out: TaggedInsight[] = [];
    queries.forEach((q, idx) => {
      const src = sources[idx];
      const bundle = q.data as InsightBundle | undefined;
      if (!src || !bundle) return;
      for (const i of bundle.insights) {
        out.push({
          ...i,
          source: src.key,
          sourceLabel: src.label,
          question: bundle.question,
          generatedAt: bundle.generated_at,
        });
      }
    });
    out.sort(
      (a, b) =>
        PRIORITY_STYLES[a.priority].order - PRIORITY_STYLES[b.priority].order,
    );
    return out;
  }, [queries, sources]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, opportunity: 0, info: 0 };
    for (const t of tagged) c[t.priority] += 1;
    return c;
  }, [tagged]);

  const [sourceFilter, setSourceFilter] = useState<SourceKey>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  const visible = useMemo(() => {
    return tagged.filter((t) => {
      if (sourceFilter !== 'all' && t.source !== sourceFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tagged, sourceFilter, priorityFilter]);

  const actionableCount = tagged.filter(
    (t) => t.action && (t.priority === 'critical' || t.priority === 'warning'),
  ).length;

  const freshest = useMemo(() => {
    const stamps = tagged.map((t) => t.generatedAt).filter(Boolean);
    if (stamps.length === 0) return null;
    const latest = stamps.sort().at(-1);
    if (!latest) return null;
    try {
      const d = new Date(latest);
      return d.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      });
    } catch {
      return null;
    }
  }, [tagged]);

  const refreshAll = () => {
    for (const src of sources) {
      queryClient.invalidateQueries({ queryKey: src.queryKey });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BrainCircuit className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              AI Insights Feed
            </h1>
            <Badge variant="primary" className="ml-2">
              Auto-generated
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Every signal worth a loyalty manager&apos;s attention — pulled from
            Overview, Predictive (Churn/CLV), Segments (RFM), and Market Basket.
            Re-computed on every window change.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WindowSelector value={timeWindow} onChange={setWindow} />
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isLoading}
            aria-label="Refresh insights"
          >
            <RefreshCw
              className={cn('mr-1.5 h-4 w-4', isLoading && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </header>

      <section
        aria-label="Insight summary"
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
      >
        <SummaryTile
          label="Total insights"
          value={tagged.length}
          icon={Sparkles}
          isLoading={isLoading}
        />
        <SummaryTile
          label="Critical"
          value={counts.critical}
          icon={AlertTriangle}
          accent="bg-rose-50 text-rose-700"
          isLoading={isLoading}
        />
        <SummaryTile
          label="Warning"
          value={counts.warning}
          icon={AlertTriangle}
          accent="bg-amber-50 text-amber-700"
          isLoading={isLoading}
        />
        <SummaryTile
          label="Opportunity"
          value={counts.opportunity}
          icon={TrendingUp}
          accent="bg-emerald-50 text-emerald-700"
          isLoading={isLoading}
        />
        <SummaryTile
          label="Actionable now"
          value={actionableCount}
          icon={Target}
          accent="bg-primary/10 text-primary"
          isLoading={isLoading}
        />
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Source</span>
            <FilterChip
              active={sourceFilter === 'all'}
              onClick={() => setSourceFilter('all')}
            >
              All ({tagged.length})
            </FilterChip>
            {sources.map((src) => {
              const n = tagged.filter((t) => t.source === src.key).length;
              return (
                <FilterChip
                  key={src.key}
                  active={sourceFilter === src.key}
                  onClick={() => setSourceFilter(src.key)}
                  icon={src.icon}
                >
                  {src.label} ({n})
                </FilterChip>
              );
            })}
          </div>
          <span className="mx-2 hidden h-6 w-px bg-border md:block" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Priority</span>
            <FilterChip
              active={priorityFilter === 'all'}
              onClick={() => setPriorityFilter('all')}
            >
              All
            </FilterChip>
            {(['critical', 'warning', 'opportunity', 'info'] as const).map((p) => (
              <FilterChip
                key={p}
                active={priorityFilter === p}
                onClick={() => setPriorityFilter(p)}
                dot={PRIORITY_STYLES[p].dot}
              >
                {PRIORITY_STYLES[p].label} ({counts[p]})
              </FilterChip>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Window: {WINDOW_LABELS[timeWindow]}
            {anchor ? ` · anchored ${anchor}` : ''}
            {freshest ? ` · generated ${freshest}` : ''}
          </span>
        </CardContent>
      </Card>

      {isError ? (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="py-6 text-sm text-rose-700">
            Some insight streams failed to load. The AI service may still be
            warming up — hit Refresh in a few seconds.
          </CardContent>
        </Card>
      ) : null}

      {isLoading && tagged.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No insights match the current filters. Widen the window, clear
            filters, or come back after fresh transactions land.
          </CardContent>
        </Card>
      ) : (
        <ul
          aria-live="polite"
          aria-label="AI-generated insights"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((t, idx) => (
            <li key={`${t.source}-${t.id}-${idx}`}>
              <InsightCard insight={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: TaggedInsight }) {
  const style = PRIORITY_STYLES[insight.priority];
  const Icon = ICON_MAP[insight.icon ?? ''] ?? Sparkles;
  return (
    <Card className={cn('h-full border-l-4 transition-shadow hover:shadow-md', style.border)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
              <Icon className="h-4 w-4 text-foreground" aria-hidden />
            </span>
            <Badge variant={style.badge}>{style.label}</Badge>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {insight.sourceLabel}
          </span>
        </div>
        <CardTitle className="mt-2 text-sm leading-snug">{insight.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-sm text-muted-foreground text-balance">{insight.text}</p>
        {insight.action ? (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
            <span className="font-medium">Next action: </span>
            {insight.action}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  accent,
  isLoading,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  accent?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            accent ?? 'bg-muted text-foreground',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {isLoading ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  icon: Icon,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
      aria-pressed={active}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {dot ? (
        <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
