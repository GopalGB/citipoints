'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { KpiGrid, KpiTile } from '@/components/kpi/kpi-tile';
import { FiltersBar, parseFilters } from '@/components/shell/filters-bar';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatAED, formatCompact, formatInt } from '@/lib/format';
import type { KpiTile as KpiTileT } from '@/lib/types';

export default function StoresPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <StoresContent />
    </Suspense>
  );
}

function StoresContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const storeQ = useQuery({
    queryKey: ['store-perf', filters],
    queryFn: () => api.storePerformance(filters),
  });
  const kpiQ = useQuery({
    queryKey: ['store-kpi', filters],
    queryFn: () => api.kpi(filters),
  });

  const stores = (storeQ.data ?? []).slice().sort((a, b) => b.revenue - a.revenue);
  const totalRev = stores.reduce((s, st) => s + st.revenue, 0) || 1;
  const totalTxns = stores.reduce((s, st) => s + st.transactions, 0) || 1;
  const avgBasketAll =
    stores.length > 0
      ? stores.reduce((s, st) => s + st.avg_basket, 0) / stores.length
      : 0;

  const topStore = stores[0];
  const topShare = topStore ? (topStore.revenue / totalRev) * 100 : 0;

  const allTiles = kpiQ.data?.tiles ?? [];
  const revenueTile = allTiles.find((t) => t.id === 'revenue');
  const txnTile = allTiles.find((t) => t.id === 'transactions');

  const storeCountTile: KpiTileT = {
    id: 'store_count',
    label: 'Active Stores',
    value: stores.length,
    value_display: formatInt(stores.length),
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: 'neutral',
  };

  const concentrationTile: KpiTileT = {
    id: 'top_share',
    label: topStore ? `${topStore.store} Share` : 'Top Store',
    value: topShare,
    value_display: `${topShare.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: topShare > 30 ? 'negative' : 'neutral',
  };

  const tiles = [revenueTile, txnTile, storeCountTile, concentrationTile].filter(
    Boolean,
  ) as KpiTileT[];

  const top10 = stores.slice(0, 10);

  // Second strip — top-3 share, median basket, avg txns/store, premium-store count
  const top3Share =
    stores.length > 0
      ? (stores.slice(0, 3).reduce((s, st) => s + st.revenue, 0) / totalRev) * 100
      : 0;
  const sortedBaskets = [...stores].map((s) => s.avg_basket).sort((a, b) => a - b);
  const medianBasket =
    sortedBaskets.length > 0
      ? sortedBaskets[Math.floor(sortedBaskets.length / 2)] ?? 0
      : 0;
  const avgTxnsPerStore = stores.length > 0 ? totalTxns / stores.length : 0;
  const premiumBasketThreshold = medianBasket * 1.25;
  const premiumStores = stores.filter(
    (s) => s.avg_basket >= premiumBasketThreshold,
  ).length;

  const tilesRow2: KpiTileT[] = [
    {
      id: 'top3_share',
      label: 'Top-3 Store Share',
      value: top3Share,
      value_display: `${top3Share.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: top3Share > 50 ? 'negative' : 'neutral',
    },
    {
      id: 'median_basket',
      label: 'Median Basket',
      value: medianBasket,
      value_display: formatAED(medianBasket),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_txns_per_store',
      label: 'Avg Txns / Store',
      value: avgTxnsPerStore,
      value_display: formatInt(Math.round(avgTxnsPerStore)),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'premium_stores',
      label: 'Premium Stores',
      value: premiumStores,
      value_display: `${premiumStores} of ${stores.length}`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'positive',
    },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Store Performance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Penetration, revenue contribution, basket size across the store
            network.
          </p>
        </div>
        <Badge variant="outline">
          {stores.length} stores · avg basket {formatAED(avgBasketAll)}
        </Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="store-kpi-heading" className="space-y-3">
        <header>
          <h2
            id="store-kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Store KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Network revenue, transactions, store count and concentration.
          </p>
        </header>
        <KpiGrid>
          {(kpiQ.isLoading ? Array.from({ length: 4 }) : tiles).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={kpiQ.isLoading}
            />
          ))}
        </KpiGrid>

        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Distribution & basket quality
          </h2>
          <p className="text-sm text-muted-foreground">
            Top-3 store skew, median basket, premium-catchment stores.
          </p>
        </header>
        <KpiGrid>
          {(storeQ.isLoading ? Array.from({ length: 4 }) : tilesRow2).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={storeQ.isLoading}
              />
            ),
          )}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Store Penetration</CardTitle>
            <CardDescription>
              Top 10 stores by revenue share — coalition penetration heatmap.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-2 pt-1">
              {top10.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading stores…
                </div>
              ) : (
                top10.map((s, i) => {
                  const pct = (s.revenue / totalRev) * 100;
                  const intensity = Math.min(pct / topShare, 1);
                  return (
                    <div key={s.store} className="flex items-center gap-3 text-sm">
                      <div className="w-5 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}.
                      </div>
                      <div className="w-32 truncate font-medium text-foreground">
                        {s.store}
                      </div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            background: `rgba(15, 17, 32, ${0.4 + intensity * 0.6})`,
                          }}
                        />
                      </div>
                      <div className="w-20 text-right font-mono text-xs font-semibold text-foreground">
                        {formatAED(s.revenue)}
                      </div>
                      <div className="w-14 text-right font-mono text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avg Basket by Store</CardTitle>
            <CardDescription>
              Top 10 stores by average basket size — high-basket stores =
              premium catchment.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              {top10.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...top10].sort((a, b) => b.avg_basket - a.avg_basket)}
                    margin={{ top: 4, right: 8, left: 0, bottom: 36 }}
                  >
                    <CartesianGrid stroke="#E8E5DC" />
                    <XAxis
                      dataKey="store"
                      tick={{ fontSize: 10, fill: '#6B6B6B' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #E8E5DC',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [formatAED(v), 'Avg Basket']}
                    />
                    <Bar
                      dataKey="avg_basket"
                      fill="#F9C349"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>All Stores — full performance table</CardTitle>
          <CardDescription>
            Revenue, transactions, average basket and shares per store.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">Store</th>
                  <th className="px-5 py-2 text-right">Revenue</th>
                  <th className="px-5 py-2 text-right">Rev Share</th>
                  <th className="px-5 py-2 text-right">Transactions</th>
                  <th className="px-5 py-2 text-right">Txn Share</th>
                  <th className="px-5 py-2 text-right">Avg Basket</th>
                </tr>
              </thead>
              <tbody>
                {stores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading stores…
                    </td>
                  </tr>
                ) : (
                  stores.map((s, i) => {
                    const revPct = (s.revenue / totalRev) * 100;
                    const txnPct = (s.transactions / totalTxns) * 100;
                    return (
                      <tr
                        key={s.store}
                        className={i % 2 === 1 ? 'bg-muted/30' : ''}
                      >
                        <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-5 py-2 font-medium text-foreground">
                          {s.store}
                        </td>
                        <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                          {formatAED(s.revenue)}
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                          {revPct.toFixed(1)}%
                        </td>
                        <td className="px-5 py-2 text-right font-mono">
                          {formatInt(s.transactions)}
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                          {txnPct.toFixed(1)}%
                        </td>
                        <td className="px-5 py-2 text-right font-mono">
                          {formatAED(s.avg_basket)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
