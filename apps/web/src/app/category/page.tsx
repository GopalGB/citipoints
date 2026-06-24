'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

const CAT_COLORS = ['#0F1120', '#F9C349', '#22A37A', '#DA9712', '#7B8A8E', '#A65A2C'];

export default function CategoryPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <CategoryContent />
    </Suspense>
  );
}

function CategoryContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const mixQ = useQuery({
    queryKey: ['cat-mix', filters],
    queryFn: () => api.categoryMix(filters),
  });
  const productsQ = useQuery({
    queryKey: ['cat-products', filters],
    queryFn: () => api.topProducts(filters, 50),
  });
  const kpiQ = useQuery({
    queryKey: ['cat-kpi', filters],
    queryFn: () => api.kpi(filters),
  });

  const mix = (mixQ.data ?? []).slice().sort((a, b) => b.revenue - a.revenue);
  const totalRev = mix.reduce((s, c) => s + c.revenue, 0) || 1;

  const products = productsQ.data ?? [];
  const totalUnits = products.reduce((s, p) => s + p.units, 0) || 1;

  // Brand-level rollup from product list (top 10 brands by revenue)
  const brandMap = new Map<string, { brand: string; revenue: number; units: number; skus: number }>();
  for (const p of products) {
    const cur = brandMap.get(p.brand) ?? { brand: p.brand, revenue: 0, units: 0, skus: 0 };
    cur.revenue += p.revenue;
    cur.units += p.units;
    cur.skus += 1;
    brandMap.set(p.brand, cur);
  }
  const topBrands = Array.from(brandMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const totalBrandRev = topBrands.reduce((s, b) => s + b.revenue, 0) || 1;

  const allTiles = kpiQ.data?.tiles ?? [];
  const revenueTile = allTiles.find((t) => t.id === 'revenue');
  const txnTile = allTiles.find((t) => t.id === 'transactions');
  const basketTile = allTiles.find((t) => t.id === 'avg_basket');

  // Synthetic Category Penetration tile (top category share)
  const topCatShare = mix.length > 0 ? (mix[0].revenue / totalRev) * 100 : 0;
  const topCatTile: KpiTileT = {
    id: 'top_cat_share',
    label: mix.length > 0 ? `${mix[0].category} Share` : 'Top Category',
    value: topCatShare,
    value_display: `${topCatShare.toFixed(1)}%`,
    delta_pct: null,
    delta_direction: 'flat',
    trend: [],
    sentiment: 'neutral',
  };

  const tiles = [revenueTile, txnTile, basketTile, topCatTile].filter(Boolean) as KpiTileT[];

  // Second strip — brand concentration, avg price, distinct SKUs, premium-mix
  const totalProductRev = products.reduce((s, p) => s + p.revenue, 0) || 1;
  const totalProductUnits = products.reduce((s, p) => s + p.units, 0) || 1;
  const avgPrice = totalProductUnits > 0 ? totalProductRev / totalProductUnits : 0;
  const topBrandShare =
    topBrands.length > 0 ? (topBrands[0].revenue / totalProductRev) * 100 : 0;
  const distinctBrands = brandMap.size;
  const distinctSkus = products.length;
  const premiumThreshold = avgPrice * 1.5;
  const premiumSkus = products.filter(
    (p) => (p.units > 0 ? p.revenue / p.units : 0) >= premiumThreshold,
  ).length;
  const premiumMix = distinctSkus > 0 ? (premiumSkus / distinctSkus) * 100 : 0;

  const tilesRow2: KpiTileT[] = [
    {
      id: 'top_brand_share',
      label: topBrands.length > 0 ? `${topBrands[0].brand} Share` : 'Top Brand',
      value: topBrandShare,
      value_display: `${topBrandShare.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_price',
      label: 'Avg Price / Unit',
      value: avgPrice,
      value_display: formatAED(avgPrice),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'distinct_brands',
      label: 'Distinct Brands',
      value: distinctBrands,
      value_display: formatInt(distinctBrands),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'premium_mix',
      label: 'Premium SKU Mix',
      value: premiumMix,
      value_display: `${premiumMix.toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: premiumMix >= 25 ? 'positive' : 'neutral',
    },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Category Drill
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Category mix, brand performance, top SKUs across the coalition.
          </p>
        </div>
        <Badge variant="outline">{mix.length} categories · {products.length} SKUs</Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="cat-kpi-heading" className="space-y-3">
        <header>
          <h2 id="cat-kpi-heading" className="font-display text-lg font-semibold text-foreground">
            Category KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Revenue, transactions, basket size and lead-category share.
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
            Brand & price tier
          </h2>
          <p className="text-sm text-muted-foreground">
            Brand concentration, average price, premium-SKU mix.
          </p>
        </header>
        <KpiGrid>
          {(productsQ.isLoading ? Array.from({ length: 4 }) : tilesRow2).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={productsQ.isLoading}
              />
            ),
          )}
        </KpiGrid>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Category Mix</CardTitle>
            <CardDescription>Revenue share across product categories.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-3 pt-1">
              {mix.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading category mix…
                </div>
              ) : (
                mix.map((c, i) => {
                  const pct = (c.revenue / totalRev) * 100;
                  return (
                    <div key={c.category} className="flex items-center gap-3 text-sm">
                      <div className="w-32 truncate font-medium text-foreground">
                        {c.category}
                      </div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            background: CAT_COLORS[i % CAT_COLORS.length],
                          }}
                        />
                      </div>
                      <div className="w-20 text-right font-mono text-xs font-semibold text-foreground">
                        {formatAED(c.revenue)}
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
            <CardTitle>Top 10 Brands</CardTitle>
            <CardDescription>Brand performance across the selected scope.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              {topBrands.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading brands…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topBrands}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#E8E5DC" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#6B6B6B' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="brand"
                      tick={{ fontSize: 11, fill: '#0F1120' }}
                      tickLine={false}
                      stroke="#E8E5DC"
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #E8E5DC',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [formatAED(v), 'Revenue']}
                    />
                    <Bar dataKey="revenue" isAnimationActive={false}>
                      {topBrands.map((_, i) => (
                        <Cell
                          key={i}
                          fill={i === 0 ? '#0F1120' : '#F9C349'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {topBrands.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Top brand{' '}
                <span className="font-semibold text-foreground">{topBrands[0].brand}</span>{' '}
                holds {((topBrands[0].revenue / totalBrandRev) * 100).toFixed(1)}% of top-10
                brand revenue.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Top SKUs</CardTitle>
          <CardDescription>
            Best-selling items across the selected category / brand / window. Drill
            into Pro view (Catalog) for full SKU search.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">SKU</th>
                  <th className="px-5 py-2">Brand</th>
                  <th className="px-5 py-2">Category</th>
                  <th className="px-5 py-2 text-right">Revenue</th>
                  <th className="px-5 py-2 text-right">Units</th>
                  <th className="px-5 py-2 text-right">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading top SKUs…
                    </td>
                  </tr>
                ) : (
                  products.slice(0, 20).map((p, i) => {
                    const avgPrice = p.units > 0 ? p.revenue / p.units : 0;
                    const unitShare = (p.units / totalUnits) * 100;
                    return (
                      <tr
                        key={p.sku_id}
                        className={i % 2 === 1 ? 'bg-muted/30' : ''}
                      >
                        <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-5 py-2 text-foreground">
                          <div className="font-medium">{p.product_name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {p.sku_id}
                          </div>
                        </td>
                        <td className="px-5 py-2 text-muted-foreground">{p.brand}</td>
                        <td className="px-5 py-2 text-muted-foreground">{p.category}</td>
                        <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                          {formatAED(p.revenue)}
                        </td>
                        <td className="px-5 py-2 text-right font-mono">
                          {formatInt(p.units)}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({unitShare.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs">
                          {formatAED(avgPrice)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {products.length > 20 ? (
            <p className="px-5 pt-2 text-[11px] text-muted-foreground">
              Showing top 20 of {products.length} SKUs.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
