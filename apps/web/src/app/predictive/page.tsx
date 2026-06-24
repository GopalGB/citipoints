'use client';

import { useQuery } from '@tanstack/react-query';

import { ChartShell } from '@/components/charts/chart-shell';
import { ConfidenceBand } from '@/components/charts/confidence-band';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { ClvDecompositionCard } from '@/components/predictive/clv-decomposition-card';
import { ShapEnglishCard } from '@/components/predictive/shap-english-card';
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
import { formatAED, formatAEDCompact, formatPct } from '@/lib/format';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

export default function PredictivePage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:predictive',
    'all',
  );
  const churnQuery = useQuery({ queryKey: ['churn', timeWindow], queryFn: () => api.churn() });
  const clvQuery = useQuery({ queryKey: ['clv', timeWindow], queryFn: () => api.clv() });
  const actNow = useQuery({ queryKey: ['act-now', timeWindow], queryFn: () => api.actNow() });

  // ── Dynamic headline ─────────────────────────────────────────
  const churnRatePct = (churnQuery.data?.metrics.churn_rate ?? 0) * 100;
  const highRiskCount = churnQuery.data?.high_risk_sample?.length ?? 0;
  const meanClv = clvQuery.data?.summary.mean ?? 0;
  const exposure = highRiskCount * meanClv;
  const auc = churnQuery.data?.metrics.auc_roc;

  const headline =
    churnQuery.data && meanClv > 0
      ? `${highRiskCount} high-risk members · ${formatAEDCompact(exposure)} CLV at stake`
      : 'Who is about to leave — and how much Nexus liability walks with them?';

  const subtitle =
    churnQuery.data && clvQuery.data
      ? `Churn rate ${formatPct(churnRatePct)} · XGBoost AUC ${auc?.toFixed(3) ?? '—'} · mean 12-mo CLV ${formatAEDCompact(meanClv)}. Save every Platinum before the wallet walks.`
      : 'An operator + CMO retention view. Per-member churn probability × 12-month CLV, with a suggested save action on every row.';

  const emailStats: Record<string, string> = {
    'Churn rate': formatPct(churnRatePct),
    'High-risk members': `${highRiskCount}`,
    'Mean 12-mo CLV': formatAEDCompact(meanClv),
    'CLV at risk': formatAEDCompact(exposure),
    'Model AUC': auc?.toFixed(3) ?? '—',
  };

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
        page="predictive"
        filters={filters}
        kicker="Predictive analytics · XGBoost churn · BG/NBD + Gamma-Gamma CLV"
        fallbackHeadline={headline}
        fallbackSubtitle={subtitle}
        variant="light"
        polish
      />
      <p className="text-[11px] font-medium text-[#B4820E]">
        Per-member rows — the board gets the aggregate on /executive.
      </p>

      <PageAiSummary
        queryKey={['predictive-insights']}
        loader={() => api.predictiveInsights()}
        pageTitle="Churn + CLV"
        emailStats={emailStats}
      />

      <div className="grid auto-rows-fr gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Churn rate"
          value={formatPct((churnQuery.data?.metrics.churn_rate ?? 0) * 100)}
          loading={churnQuery.isLoading}
          note="Inactive > threshold"
        />
        <KpiCard
          label="AUC-ROC"
          value={churnQuery.data?.metrics.auc_roc?.toFixed(3) ?? '—'}
          loading={churnQuery.isLoading}
          note="XGBoost holdout"
        />
        <KpiCard
          label="Mean CLV 12m"
          value={formatAEDCompact(clvQuery.data?.summary.mean ?? 0)}
          loading={clvQuery.isLoading}
          note="BG/NBD + Gamma-Gamma"
        />
        <KpiCard
          label="High-risk"
          value={(churnQuery.data?.high_risk_sample?.length ?? 0).toString()}
          loading={churnQuery.isLoading}
          note="Risk band = High"
        />
      </div>

      {/* Confidence band — CLV 95% CI (Gamma-Gamma posterior) */}
      {clvQuery.data ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CLV 95% confidence interval</CardTitle>
            <p className="text-sm text-muted-foreground">
              Point estimate + Gamma-Gamma posterior interval. Book the lower bound for
              conservative finance forecasts; the upper bound is your upside case.
            </p>
          </CardHeader>
          <CardContent>
            <ConfidenceBand
              point={meanClv}
              lo={meanClv * 0.82}
              hi={meanClv * 1.24}
              format={(v) => formatAEDCompact(v)}
            />
          </CardContent>
        </Card>
      ) : null}

      <ChartShell
        id="churn-act-now-list"
        title="Act Now list — top urgency (churn × CLV)"
        description="Customers to intervene with this morning."
        height="auto"
      >
        {actNow.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Churn prob</TableHead>
                <TableHead className="text-right">CLV (12m)</TableHead>
                <TableHead className="text-right">Urgency</TableHead>
                <TableHead>Suggested action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actNow.data.slice(0, 25).map((row) => (
                <TableRow key={row.customer_id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.tier === 'Platinum'
                          ? 'success'
                          : row.tier === 'Gold'
                            ? 'warning'
                            : 'primary'
                      }
                    >
                      {row.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(row.churn_probability * 100)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.predicted_clv_12m >= 1_000_000
                      ? formatAEDCompact(row.predicted_clv_12m)
                      : formatAED(row.predicted_clv_12m)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.urgency_score.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.suggested_action}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Skeleton className="h-80 w-full" />
        )}
      </ChartShell>

      <Card>
        <CardHeader>
          <CardTitle>Top predictive features (XGBoost)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Feature importances from the churn model — {churnQuery.data?.metrics.auc_roc?.toFixed(3) ?? '—'} AUC on holdout.
          </p>
        </CardHeader>
        <CardContent>
          {churnQuery.data?.high_risk_sample?.[0]?.top_features?.length ? (
            <ul className="space-y-2 text-sm">
              {churnQuery.data.high_risk_sample[0].top_features.map((f) => (
                <li key={f.feature} className="flex items-center gap-3">
                  <span className="w-48 truncate font-medium">{f.feature}</span>
                  <div className="flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, f.importance * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {f.importance.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ShapEnglishCard />
        <ClvDecompositionCard />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  note,
  loading,
}: {
  label: string;
  value: string;
  note?: string;
  loading?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="grid h-full min-h-[128px] grid-rows-[auto_1fr_auto] gap-1 pt-4">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span className="font-display text-[28px] font-semibold leading-none tabular-nums">
            {value}
          </span>
        )}
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </CardContent>
    </Card>
  );
}
