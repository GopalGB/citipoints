'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';

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
import { formatInt } from '@/lib/format';
import type { KpiTile as KpiTileT } from '@/lib/types';

export default function BundlesPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-muted/40" />
          <div className="h-40 rounded-xl bg-muted/40" />
        </div>
      }
    >
      <BundlesContent />
    </Suspense>
  );
}

function BundlesContent() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const rulesQ = useQuery({
    queryKey: ['basket-rules', filters],
    queryFn: () => api.basketRules({ min_support: 0.01, min_confidence: 0.2, limit: 30 }, filters),
  });

  const rules = (rulesQ.data ?? [])
    .slice()
    .sort((a, b) => b.lift - a.lift);

  const ruleCount = rules.length;
  const avgLift =
    rules.length > 0 ? rules.reduce((s, r) => s + r.lift, 0) / rules.length : 0;
  const avgConf =
    rules.length > 0 ? rules.reduce((s, r) => s + r.confidence, 0) / rules.length : 0;
  const topLift = rules.length > 0 ? rules[0].lift : 0;

  const tiles: KpiTileT[] = [
    {
      id: 'rule_count',
      label: 'Strong Rules',
      value: ruleCount,
      value_display: formatInt(ruleCount),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'avg_lift',
      label: 'Avg Lift',
      value: avgLift,
      value_display: avgLift.toFixed(2) + '×',
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: avgLift >= 2 ? 'positive' : 'neutral',
    },
    {
      id: 'avg_conf',
      label: 'Avg Confidence',
      value: avgConf * 100,
      value_display: `${(avgConf * 100).toFixed(1)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'top_lift',
      label: 'Top Lift',
      value: topLift,
      value_display: topLift.toFixed(2) + '×',
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: topLift >= 3 ? 'positive' : 'neutral',
    },
  ];

  // Top 10 affinity bars by lift
  const top10 = rules.slice(0, 10);
  const maxLift = top10.length > 0 ? top10[0].lift : 1;

  // Second strip — strong-rule slicing & SKU coverage
  const highLiftCount = rules.filter((r) => r.lift >= 3).length;
  const highConfCount = rules.filter((r) => r.confidence >= 0.5).length;
  const sortedSupports = [...rules].map((r) => r.support).sort((a, b) => a - b);
  const medianSupport =
    sortedSupports.length > 0
      ? sortedSupports[Math.floor(sortedSupports.length / 2)]
      : 0;
  const distinctSkus = new Set<string>();
  for (const r of rules) {
    for (const a of r.antecedents) distinctSkus.add(a);
    for (const c of r.consequents) distinctSkus.add(c);
  }

  const tilesRow2: KpiTileT[] = [
    {
      id: 'high_lift',
      label: 'High-Lift Pairs (≥ 3×)',
      value: highLiftCount,
      value_display: formatInt(highLiftCount),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: highLiftCount >= 5 ? 'positive' : 'neutral',
    },
    {
      id: 'high_conf',
      label: 'High-Conf Pairs (≥ 50%)',
      value: highConfCount,
      value_display: formatInt(highConfCount),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: highConfCount >= 5 ? 'positive' : 'neutral',
    },
    {
      id: 'median_support',
      label: 'Median Support',
      value: medianSupport * 100,
      value_display: `${(medianSupport * 100).toFixed(2)}%`,
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
    {
      id: 'distinct_skus',
      label: 'SKUs in Rules',
      value: distinctSkus.size,
      value_display: formatInt(distinctSkus.size),
      delta_pct: null,
      delta_direction: 'flat',
      trend: [],
      sentiment: 'neutral',
    },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Bundle Builder
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Basket affinity, bundle opportunity and SKU pairings — Apriori
            association rules across the coalition.
          </p>
        </div>
        <Badge variant="outline">{ruleCount} association rules</Badge>
      </header>

      <FiltersBar />

      <section aria-labelledby="bundle-kpi-heading" className="space-y-3">
        <header>
          <h2
            id="bundle-kpi-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Affinity KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Lift &gt; 1 means buying A makes B more likely than chance. Lift
            &gt; 2 = strong cross-sell candidate.
          </p>
        </header>
        <KpiGrid>
          {(rulesQ.isLoading ? Array.from({ length: 4 }) : tiles).map((tile, i) => (
            <KpiTile
              key={(tile as { id?: string } | undefined)?.id ?? i}
              tile={tile as KpiTileT | undefined}
              loading={rulesQ.isLoading}
            />
          ))}
        </KpiGrid>

        <header className="pt-2">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Strong-rule slice & SKU coverage
          </h2>
          <p className="text-sm text-muted-foreground">
            High-lift / high-confidence pairs and how many SKUs participate.
          </p>
        </header>
        <KpiGrid>
          {(rulesQ.isLoading ? Array.from({ length: 4 }) : tilesRow2).map(
            (tile, i) => (
              <KpiTile
                key={(tile as { id?: string } | undefined)?.id ?? i}
                tile={tile as KpiTileT | undefined}
                loading={rulesQ.isLoading}
              />
            ),
          )}
        </KpiGrid>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Bundle Opportunities</CardTitle>
          <CardDescription>
            Highest-lift product pairings. Use for cross-sell campaigns,
            shelf-adjacency, and bundle pricing.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-2 pt-1">
            {top10.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading association rules…
              </div>
            ) : (
              top10.map((r, i) => {
                const widthPct = (r.lift / maxLift) * 100;
                return (
                  <div
                    key={`${r.antecedents_label}-${r.consequents_label}-${i}`}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="w-5 text-right font-mono text-xs text-muted-foreground">
                      {i + 1}.
                    </div>
                    <div className="flex w-72 flex-col gap-0.5 truncate">
                      <span className="truncate font-medium text-foreground">
                        {r.antecedents_label}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        → {r.consequents_label}
                      </span>
                    </div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full bg-[#0F1120]"
                        style={{ width: `${Math.max(widthPct, 1)}%` }}
                      />
                    </div>
                    <div className="w-16 text-right font-mono text-xs font-semibold text-foreground">
                      {r.lift.toFixed(2)}×
                    </div>
                    <div className="w-14 text-right font-mono text-xs text-muted-foreground">
                      {(r.confidence * 100).toFixed(0)}%
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
          <CardTitle>All Association Rules</CardTitle>
          <CardDescription>
            Full Apriori output — filter by lift, confidence, support to find
            the right bundle. Drill into Pro view (Basket) for SKU-level
            campaign briefs.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-right">#</th>
                  <th className="px-5 py-2">If customer buys</th>
                  <th className="px-5 py-2">They also buy</th>
                  <th className="px-5 py-2 text-right">Lift</th>
                  <th className="px-5 py-2 text-right">Confidence</th>
                  <th className="px-5 py-2 text-right">Support</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading association rules…
                    </td>
                  </tr>
                ) : (
                  rules.map((r, i) => (
                    <tr
                      key={`${r.antecedents_label}-${r.consequents_label}-${i}`}
                      className={i % 2 === 1 ? 'bg-muted/30' : ''}
                    >
                      <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-5 py-2 font-medium text-foreground">
                        {r.antecedents_label}
                      </td>
                      <td className="px-5 py-2 text-foreground">
                        {r.consequents_label}
                      </td>
                      <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                        {r.lift.toFixed(2)}×
                      </td>
                      <td className="px-5 py-2 text-right font-mono">
                        {(r.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs text-muted-foreground">
                        {(r.support * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
