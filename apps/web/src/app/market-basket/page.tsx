'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ChartShell } from '@/components/charts/chart-shell';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';

export default function MarketBasketPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:market-basket', 'all');
  const [byCategory, setByCategory] = useState(false);
  const [minSupport, setMinSupport] = useState(0.02);
  const [minConfidence, setMinConfidence] = useState(0.3);
  const [anchor, setAnchor] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['basket-rules', byCategory, minSupport, minConfidence, timeWindow],
    queryFn: () =>
      api.basketRules(
        {
          by_category: byCategory,
          min_support: minSupport,
          min_confidence: minConfidence,
          limit: 60,
        },
        windowFilters,
      ),
  });

  const anchorCandidates = useMemo(() => {
    const rules = rulesQuery.data ?? [];
    const set = new Set<string>();
    for (const r of rules) {
      for (const item of r.antecedents) set.add(item);
    }
    return [...set].sort();
  }, [rulesQuery.data]);

  const bundleQuery = useQuery({
    queryKey: ['basket-bundle', anchor],
    enabled: !!anchor,
    queryFn: () => api.basketBundle(anchor as string, 5),
  });

  // ── Dynamic headline + email stats ─────────────────────────────
  const rules = rulesQuery.data ?? [];
  const topRule = rules[0];
  const avgLift =
    rules.length > 0 ? rules.reduce((a, r) => a + r.lift, 0) / rules.length : null;
  const strongCount = rules.filter((r) => r.lift >= 2).length;

  const headline = topRule
    ? `Top bundle: ${topRule.antecedents_label} + ${topRule.consequents_label} · ${topRule.lift.toFixed(1)}× lift`
    : 'Which products should we bundle next?';

  const subtitle = rules.length
    ? `${rules.length} rules surfaced · ${strongCount} with lift ≥ 2× · avg lift ${avgLift?.toFixed(2)}× at ${(minSupport * 100).toFixed(1)}% support threshold.`
    : 'A merchandising + CMO view. FP-Growth with live support / confidence controls — anchor any product to generate a campaign brief.';

  const emailStats: Record<string, string> = {
    Window: WINDOW_LABELS[timeWindow],
    'Rules found': `${rules.length}`,
    'Strong (lift ≥ 2×)': `${strongCount}`,
    'Min support': minSupport.toFixed(3),
    'Min confidence': `${(minConfidence * 100).toFixed(0)}%`,
    Granularity: byCategory ? 'Category-level' : 'SKU-level',
  };
  if (topRule) {
    emailStats['Top bundle'] = `${topRule.antecedents_label} → ${topRule.consequents_label} (${topRule.lift.toFixed(2)}× lift, ${(topRule.confidence * 100).toFixed(0)}% confidence)`;
  }

  // Rich tabular export — every FP-Growth rule as a row for downstream analysis.
  const exportRows = rules.length
    ? [
        {
          sheetName: 'Basket rules',
          rows: rules.map((r) => ({
            Antecedents: r.antecedents_label,
            Consequents: r.consequents_label,
            Support: Number(r.support.toFixed(4)),
            Confidence: Number((r.confidence).toFixed(4)),
            Lift: Number(r.lift.toFixed(3)),
            Granularity: byCategory ? 'category' : 'sku',
          })),
        },
      ]
    : undefined;

  return (
    <div className="animate-fade-up space-y-6">
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
          </span>
          <div className="flex flex-col items-end gap-1">
            <WindowSelector value={timeWindow} onChange={setWindow} />
            {dataAnchor && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Anchored to <span className="font-mono text-foreground">{dataAnchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <DynamicBanner
        page="market-basket"
        filters={windowFilters}
        kicker="Market basket · FP-Growth"
        fallbackHeadline={headline}
        fallbackSubtitle={subtitle}
        variant="light"
        polish
      />
      <p className="max-w-3xl rounded-md border border-[#F9C349]/30 bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
        <span className="font-semibold">Points-aware read:</span> lift ≥ 2× bundles are promo
        candidates. Bundling earns 1 Nexus per AED so deeper baskets = deeper liability — pair
        every bundle with a redemption campaign 60 days later to burn down the Nexus before
        they hit the 24-month expiry.
      </p>

      <PageAiSummary
        queryKey={['basket-insights']}
        loader={() => api.basketInsights()}
        pageTitle="Market Basket"
        emailStats={emailStats}
        exportRows={exportRows}
      />

      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Granularity
            </span>
            <Select
              value={byCategory ? 'category' : 'sku'}
              onValueChange={(v) => setByCategory(v === 'category')}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sku">SKU-level</SelectItem>
                <SelectItem value="category">Category-level</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Min support — {minSupport.toFixed(2)}
            </span>
            <input
              aria-label="Min support"
              type="range"
              min={0.01}
              max={0.1}
              step={0.005}
              value={minSupport}
              onChange={(e) => setMinSupport(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Min confidence — {minConfidence.toFixed(2)}
            </span>
            <input
              aria-label="Min confidence"
              type="range"
              min={0.1}
              max={0.8}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>
        </CardContent>
      </Card>

      <ChartShell
        id="basket-top-pairs"
        title="Top product pairs by lift"
        description="Higher lift = stronger cross-sell signal"
        height="auto"
      >
        {rulesQuery.isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (rulesQuery.data?.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No rules at these thresholds. Lower support or confidence to surface weaker patterns.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>If buys</TableHead>
                <TableHead>They also buy</TableHead>
                <TableHead className="text-right">Support</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="text-right">Lift</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesQuery.data!.slice(0, 20).map((rule) => (
                <TableRow key={`${rule.antecedents_label}->${rule.consequents_label}`}>
                  <TableCell className="max-w-[220px] truncate" title={rule.antecedents_label}>
                    {rule.antecedents_label}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={rule.consequents_label}>
                    {rule.consequents_label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rule.support.toFixed(3)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(rule.confidence * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    <Badge variant={rule.lift > 3 ? 'success' : 'primary'}>
                      {rule.lift.toFixed(2)}x
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAnchor(rule.antecedents[0] ?? null)}
                    >
                      Build bundle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ChartShell>

      <Card>
        <CardHeader>
          <CardTitle>Bundle Builder — Basket → Campaign bridge</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pick an anchor product to get ranked companion SKUs, each with an auto-drafted
            campaign brief your loyalty team can forward straight to Ops.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={anchor ?? ''} onValueChange={(v) => setAnchor(v)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select anchor product" />
              </SelectTrigger>
              <SelectContent>
                {anchorCandidates.slice(0, 100).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bundleQuery.isLoading ? (
              <span className="text-xs text-muted-foreground">Scoring companions…</span>
            ) : null}
          </div>

          {bundleQuery.data?.length ? (
            <ul className="space-y-3">
              {bundleQuery.data.map((b) => (
                <li
                  key={`${b.anchor}-${b.companion}`}
                  className="rounded-lg border border-border bg-muted/30 p-4"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold">{b.anchor}</span>
                    <span className="text-sm text-muted-foreground">+</span>
                    <span className="text-sm font-semibold">{b.companion}</span>
                    <Badge variant="success" className="ml-auto">
                      Lift {b.lift.toFixed(2)}x
                    </Badge>
                    <Badge variant="primary">{(b.confidence * 100).toFixed(0)}% confidence</Badge>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{b.campaign_brief}</p>
                </li>
              ))}
            </ul>
          ) : anchor ? (
            <p className="text-sm text-muted-foreground">
              No companions for this anchor at current thresholds.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose an anchor (or click <em>Build bundle</em> on a rule above) to start.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
