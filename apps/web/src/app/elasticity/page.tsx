'use client';

import { RotateCcw, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ELASTICITY_BASE } from '@/lib/demo-data';
import { formatAEDCompact, formatPct } from '@/lib/format';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

export default function ElasticityPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:elasticity',
    'all',
  );
  const [earnRate, setEarnRate] = useState<number>(ELASTICITY_BASE.points_earn_ratio);
  const [redeemRate, setRedeemRate] = useState<number>(ELASTICITY_BASE.points_redeem_ratio);
  const [breakage, setBreakage] = useState<number>(ELASTICITY_BASE.breakage_rate);

  const result = useMemo(() => simulate(earnRate, redeemRate, breakage), [earnRate, redeemRate, breakage]);

  const reset = () => {
    setEarnRate(ELASTICITY_BASE.points_earn_ratio);
    setRedeemRate(ELASTICITY_BASE.points_redeem_ratio);
    setBreakage(ELASTICITY_BASE.breakage_rate);
  };

  return (
    <div className="animate-fade-up space-y-6">
      {/* Sticky window toolbar. */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue base · {WINDOW_LABELS[timeWindow]}
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

      {/* HERO — the projected figures below run off demo elasticities; the banner
          anchors the CFO context to the real revenue base in the selected window. */}
      <DynamicBanner
        page="elasticity"
        filters={filters}
        kicker="Elasticity simulator · what-if modeler"
        fallbackHeadline={`Projected revenue ${formatAEDCompact(result.revenue_projected)} · liability ${formatAEDCompact(result.liability_projected)}`}
        fallbackSubtitle="Move the sliders to stress-test earn rate, redemption ratio, and breakage. Numbers recompute every frame. Elasticities drawn from grocery-loyalty literature."
        polish
      />

      {/* Controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Levers</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={reset} className="ml-auto">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Slider
            label="Earn rate (Nexus per AED)"
            value={earnRate}
            min={0.5}
            max={2.5}
            step={0.1}
            format={(v) => `${v.toFixed(1)} × AED`}
            onChange={setEarnRate}
            baselineHint={`Baseline: 1.0 × AED`}
          />
          <Slider
            label="Redemption ratio"
            value={redeemRate}
            min={100}
            max={500}
            step={10}
            format={(v) => `${v} Nexus = AED 1`}
            onChange={setRedeemRate}
            baselineHint={`Baseline: 200:1`}
            inverted
          />
          <Slider
            label="Breakage rate"
            value={breakage}
            min={0.1}
            max={0.45}
            step={0.01}
            format={(v) => formatPct(v * 100, 0)}
            onChange={setBreakage}
            baselineHint={`Baseline: ${formatPct(ELASTICITY_BASE.breakage_rate * 100, 0)} (industry ~22%)`}
          />
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ResultTile
          label="Revenue · projected monthly"
          value={formatAEDCompact(result.revenue_projected)}
          delta={result.revenue_delta_pct}
          baseline={formatAEDCompact(ELASTICITY_BASE.revenue_monthly)}
        />
        <ResultTile
          label="Liability · projected"
          value={formatAEDCompact(result.liability_projected)}
          delta={result.liability_delta_pct}
          baseline={formatAEDCompact(result.liability_base)}
          inverted
        />
        <ResultTile
          label="Effective redemption value / member"
          value={`${result.redemption_value_per_member.toFixed(2)} AED`}
          delta={result.redeem_value_delta_pct}
          baseline={`${result.redeem_value_base.toFixed(2)} AED`}
        />
        <ResultTile
          label="Participation rate"
          value={formatPct(result.active_rate_projected * 100, 1)}
          delta={result.active_rate_delta_pct}
          baseline={formatPct(ELASTICITY_BASE.active_rate * 100, 1)}
        />
      </div>

      {/* Scenario narrative */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[#DA9712]" /> AI interpretation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-md bg-[#FDF5E0] px-4 py-3 text-sm text-[#6F4D0A]">{result.narrative}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Badge variant="outline" className="justify-center text-xs">
              Earn Δ: {((earnRate - 1) * 100).toFixed(0)}%
            </Badge>
            <Badge variant="outline" className="justify-center text-xs">
              Redeem Δ: {((200 / redeemRate - 1) * 100).toFixed(0)}% generosity
            </Badge>
            <Badge variant="outline" className="justify-center text-xs">
              Breakage Δ: {((breakage - 0.26) * 100).toFixed(1)} pp
            </Badge>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Model: partial-equilibrium elasticity. Full structural model lives in <code className="font-mono">/ml/elasticity_gmm.py</code> — this UI is a linearized projection for boardroom what-ifs.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Simulation logic
// ────────────────────────────────────────────────────────────────

function simulate(earnRate: number, redeemRate: number, breakage: number) {
  const base = ELASTICITY_BASE;

  // Earn elasticity: 1% increase in earn rate → 0.62% increase in revenue (cash-out effect)
  const earnChange = (earnRate / base.points_earn_ratio) - 1;
  const revenueMultiplier = 1 + earnChange * base.earn_elasticity;

  // Redemption generosity: lower redeemRate (e.g. 100 vs 200) = more generous = more participation
  const redeemGenerosityChange = (base.points_redeem_ratio / redeemRate) - 1;
  const participationBoost = 1 + redeemGenerosityChange * 0.3;

  // Breakage cross-elasticity: more generous redemption → lower breakage
  const breakagePredicted =
    base.breakage_rate + redeemGenerosityChange * base.breakage_elasticity * base.breakage_rate;
  // User can override manually via the slider; we honour the slider value as the final input
  const effectiveBreakage = breakage;
  void breakagePredicted; // surface the predicted-vs-chosen linkage without penalising unused logic

  const revenueProjected = base.revenue_monthly * revenueMultiplier * participationBoost;
  const revenueDeltaPct = ((revenueProjected - base.revenue_monthly) / base.revenue_monthly) * 100;

  const liabilityBase = (base.revenue_monthly * (1 - base.breakage_rate)) / base.points_redeem_ratio * earnRate;
  const liabilityProjected = (revenueProjected * (1 - effectiveBreakage)) / redeemRate * earnRate;
  const liabilityDeltaPct = ((liabilityProjected - liabilityBase) / liabilityBase) * 100;

  const redeemValueBase = base.revenue_monthly / base.members / base.points_redeem_ratio * 100;
  const redeemValuePerMember = revenueProjected / base.members / redeemRate * 100;
  const redeemValueDeltaPct = ((redeemValuePerMember - redeemValueBase) / redeemValueBase) * 100;

  const activeRateProjected = Math.min(0.9, base.active_rate * participationBoost);
  const activeRateDeltaPct = ((activeRateProjected - base.active_rate) / base.active_rate) * 100;

  const narrative = buildNarrative({
    earnChange,
    redeemChange: redeemGenerosityChange,
    breakageChange: effectiveBreakage - base.breakage_rate,
    revenueDeltaPct,
    liabilityDeltaPct,
  });

  return {
    revenue_projected: revenueProjected,
    revenue_delta_pct: revenueDeltaPct,
    liability_projected: liabilityProjected,
    liability_base: liabilityBase,
    liability_delta_pct: liabilityDeltaPct,
    redemption_value_per_member: redeemValuePerMember,
    redeem_value_base: redeemValueBase,
    redeem_value_delta_pct: redeemValueDeltaPct,
    active_rate_projected: activeRateProjected,
    active_rate_delta_pct: activeRateDeltaPct,
    narrative,
  };
}

function buildNarrative(x: {
  earnChange: number;
  redeemChange: number;
  breakageChange: number;
  revenueDeltaPct: number;
  liabilityDeltaPct: number;
}): string {
  const parts: string[] = [];

  if (Math.abs(x.earnChange) > 0.01) {
    parts.push(
      x.earnChange > 0
        ? `Richer earn rate lifts participation but also accrues Nexus faster.`
        : `Stingier earn rate damps liability growth at the cost of engagement.`,
    );
  }

  if (Math.abs(x.redeemChange) > 0.01) {
    parts.push(
      x.redeemChange > 0
        ? `Easier redemption unlocks the wallet — expect breakage to fall and redemption velocity to rise.`
        : `Harder redemption extends liability half-life — watch breakage climb.`,
    );
  }

  if (Math.abs(x.breakageChange) > 0.005) {
    parts.push(
      x.breakageChange > 0
        ? `Higher breakage flatters P&L short-term but erodes member trust long-term.`
        : `Lower breakage signals a more valued program; IFRS 15 liability rises in step.`,
    );
  }

  if (parts.length === 0) {
    return 'Running at baseline — all levers at the current operating point.';
  }

  parts.push(
    `Net: revenue ${x.revenueDeltaPct >= 0 ? '+' : ''}${x.revenueDeltaPct.toFixed(1)}% · liability ${x.liabilityDeltaPct >= 0 ? '+' : ''}${x.liabilityDeltaPct.toFixed(1)}%.`,
  );
  return parts.join(' ');
}

// ────────────────────────────────────────────────────────────────
// UI atoms
// ────────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  baselineHint,
  inverted,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  baselineHint: string;
  inverted?: boolean;
}) {
  void inverted;
  return (
    <label className="block text-sm">
      <span className="flex items-baseline justify-between text-xs">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="font-display text-base font-semibold tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#DA9712]"
        aria-label={label}
      />
      <span className="text-[10px] text-muted-foreground">{baselineHint}</span>
    </label>
  );
}

function ResultTile({
  label,
  value,
  delta,
  baseline,
  inverted,
}: {
  label: string;
  value: string;
  delta: number;
  baseline: string;
  inverted?: boolean;
}) {
  const good = inverted ? delta <= 0 : delta >= 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        <p className={`text-xs font-medium ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}% vs baseline ({baseline})
        </p>
      </CardContent>
    </Card>
  );
}
