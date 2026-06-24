'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useMemo } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';
import type { Tier } from '@/lib/types';
import { cn } from '@/lib/utils';

const TIERS: Tier[] = ['Platinum', 'Gold', 'Silver', 'Bronze'];
const TIER_RANK: Record<Tier, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3 };

export default function TierMigrationPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:tier-migration',
    'all',
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tier-migration-matrix', timeWindow],
    queryFn: () => api.tierMigrationMatrix(filters),
  });

  const matrix = useMemo(() => {
    const base: Record<Tier, Record<Tier, number>> = {
      Platinum: { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 },
      Gold: { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 },
      Silver: { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 },
      Bronze: { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 },
    };
    for (const edge of data?.matrix ?? []) {
      base[edge.source_tier][edge.target_tier] = edge.members;
    }
    return base;
  }, [data]);

  const max = useMemo(() => {
    return Math.max(0, ...TIERS.flatMap((s) => TIERS.map((d) => matrix[s][d])));
  }, [matrix]);

  const hasData = (data?.total_tracked ?? 0) > 0;
  const headlineText = data?.headline.text ?? 'Select a window to see tier migration.';

  return (
    <div className="animate-fade-up space-y-6">
      {/* Toolbar — sticky under the app-shell nav so the window selector is always in reach */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
          </span>
          <div className="flex flex-col items-end gap-1">
            <WindowSelector value={timeWindow} onChange={setWindow} />
            {anchor && (
              <span
                className="text-[10px] font-medium text-muted-foreground"
                title="All windows measure backwards from the latest warehouse date so demo data and lagged feeds still return real results."
              >
                Anchored to <span className="font-mono text-foreground">{anchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <DynamicBanner
        page="tier-migration"
        filters={filters}
        kicker={`Tier migration · ${data ? `${data.period_a_label} → ${data.period_b_label}` : 'loading window…'}`}
        fallbackHeadline={
          isError
            ? 'Could not load tier migration — the warehouse may be warming up.'
            : headlineText
        }
        fallbackSubtitle="Spend-based tiers recomputed inside each half of the selected window, so movement is always within-period. Up-migrations signal healthy earn acceleration; down-migrations signal Nexus liability accumulating toward the 24-month expiry (breakage risk)."
        variant="light"
        polish
      />

      {/* Diagnostic strip */}
      <div className="grid gap-3 md:grid-cols-4">
        <DiagnosticTile
          label="Tracked members"
          value={data?.total_tracked ?? 0}
          icon="dot"
          loading={isLoading}
        />
        <DiagnosticTile
          label="Climbed a tier"
          value={data?.up_migrators ?? 0}
          secondary={data ? `${data.up_pct.toFixed(1)}% of tracked` : undefined}
          icon="up"
          loading={isLoading}
        />
        <DiagnosticTile
          label="Dropped a tier"
          value={data?.down_migrators ?? 0}
          secondary={data ? `${data.down_pct.toFixed(1)}% of tracked` : undefined}
          icon="down"
          loading={isLoading}
        />
        <DiagnosticTile
          label="Held their tier"
          value={data?.static_members ?? 0}
          icon="flat"
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Migration matrix</CardTitle>
          <p className="text-sm text-muted-foreground">
            Rows = tier during{' '}
            <span className="font-medium text-foreground">
              {data?.period_a_label ?? 'period A'}
            </span>
            , columns = tier during{' '}
            <span className="font-medium text-foreground">
              {data?.period_b_label ?? 'period B'}
            </span>
            . Cell colour = member count. Diagonal = no movement.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <NexusLoader
              label="Computing tier migration matrix"
              sublabel="NTILE quartiles · two halves of the window"
              height={260}
            />
          ) : !hasData ? (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              No members earned enough in both halves of{' '}
              <span className="font-medium">{WINDOW_LABELS[timeWindow]}</span> to compute
              migration. Widen the window or wait for more data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left font-medium text-muted-foreground">
                      From ↓ / To →
                    </th>
                    {TIERS.map((t) => (
                      <th
                        key={t}
                        className="p-2 text-center font-medium text-muted-foreground"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((src) => (
                    <tr key={src}>
                      <th className="p-2 text-left font-medium text-foreground">{src}</th>
                      {TIERS.map((dst) => {
                        const value = matrix[src][dst];
                        const intensity = max === 0 ? 0 : value / max;
                        const delta = TIER_RANK[dst] - TIER_RANK[src];
                        const isLift = delta > 0;
                        const isDrop = delta < 0;
                        const hue = isLift ? 158 : isDrop ? 350 : 174;
                        return (
                          <td
                            key={`${src}-${dst}`}
                            className={cn(
                              'p-2 text-center tabular-nums',
                              src === dst
                                ? 'font-semibold text-foreground'
                                : 'text-foreground',
                            )}
                            style={{
                              backgroundColor:
                                value === 0
                                  ? 'transparent'
                                  : `hsla(${hue}, 80%, 38%, ${(0.08 + intensity * 0.5).toFixed(2)})`,
                            }}
                            title={`${value.toLocaleString('en-US')} members ${src}→${dst}`}
                          >
                            {value.toLocaleString('en-US')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Highlight routes */}
      {hasData && (
        <div className="grid gap-3 md:grid-cols-2">
          {data?.biggest_lift_route && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-emerald-700">
                  Biggest upward flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl font-semibold">
                  {data.biggest_lift_route}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.biggest_lift_members.toLocaleString('en-US')} members — celebrate with a
                  tier-confirmed campaign before Nexus go stale.
                </p>
              </CardContent>
            </Card>
          )}
          {data?.biggest_drop_route && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-rose-700">Biggest downward flow</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-xl font-semibold">
                  {data.biggest_drop_route}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.biggest_drop_members.toLocaleString('en-US')} members — win-back offer
                  costs a fraction of re-acquisition.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticTile({
  label,
  value,
  secondary,
  icon,
  loading,
}: {
  label: string;
  value: number;
  secondary?: string;
  icon: 'up' | 'down' | 'flat' | 'dot';
  loading?: boolean;
}) {
  const Icon = icon === 'up' ? ArrowUpRight : icon === 'down' ? ArrowDownRight : Minus;
  const iconColour =
    icon === 'up'
      ? 'text-emerald-600'
      : icon === 'down'
        ? 'text-rose-600'
        : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4">
        {icon !== 'dot' && <Icon className={cn('h-5 w-5', iconColour)} aria-hidden />}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-20" />
          ) : (
            <p className="font-display text-2xl font-semibold tabular-nums">
              {value.toLocaleString('en-US')}
            </p>
          )}
          {secondary && !loading && (
            <p className="text-[11px] text-muted-foreground">{secondary}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
