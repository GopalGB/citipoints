'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { formatDelta } from '@/lib/format';
import type { KpiTile as KpiTileT } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  tile?: KpiTileT;
  loading?: boolean;
}

export function KpiTile({ tile, loading }: Props) {
  const stroke = useMemo(() => {
    switch (tile?.sentiment) {
      case 'positive':
        return 'hsl(var(--success))';
      case 'negative':
        return 'hsl(var(--danger))';
      default:
        return 'hsl(var(--primary))';
    }
  }, [tile?.sentiment]);

  if (loading || !tile) {
    return (
      <div
        className="flex h-[148px] flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-tile"
        role="status"
        aria-busy="true"
        aria-label="KPI loading"
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  const DeltaIcon = tile.delta_direction === 'up' ? ArrowUpRight : tile.delta_direction === 'down' ? ArrowDownRight : Minus;
  const deltaClass =
    tile.sentiment === 'positive'
      ? 'text-success'
      : tile.sentiment === 'negative'
        ? 'text-danger'
        : 'text-muted-foreground';

  const data = tile.trend.map((p) => ({ date: p.x, value: p.y }));

  return (
    <article
      className="group relative flex h-[148px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-tile transition-shadow hover:shadow-pop"
      aria-labelledby={`kpi-${tile.id}-label`}
    >
      <header className="flex items-center justify-between">
        <p
          id={`kpi-${tile.id}-label`}
          className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {tile.label}
        </p>
      </header>

      <div>
        <p className="font-display text-[32px] font-semibold leading-none tabular-nums md:text-display">
          {tile.value_display}
        </p>
        <p className={cn('mt-2 inline-flex items-center gap-1 text-[13px] font-medium', deltaClass)}>
          <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatDelta(tile.delta_pct)}</span>
          <span className="text-muted-foreground">vs prior</span>
        </p>
      </div>

      {data.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36px] opacity-70">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${tile.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#spark-${tile.id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </article>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
