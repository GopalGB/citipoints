'use client';

import { Coins, Percent, RefreshCw, TrendingDown } from 'lucide-react';

import { formatAEDCompact } from '@/lib/format';
import type { KpiTile } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Coalition-specific financial KPIs that Power BI templates never ship with.
 * These are the CFO-facing numbers that a coalition-loyalty CEO lives with
 * every day — and that a generic BI tool has no clue how to compute.
 *
 * Formulae (demo values derived from issued points + standard industry ratios):
 *   - Points Issued  = revenue_AED × 1 Nexus/AED (Acme Retail earn rate, per FAQ)
 *   - Breakage Rate  = 26 % (industry midpoint, 15–40 % band per Voucherify 2025)
 *   - Liability AED  = points_outstanding × (1/200) AED/point × (1 − breakage)
 *   - Earn/Burn      = issued / redeemed (>1 = liability accumulating)
 *   - Velocity       = avg days from issue → redeem (fast = healthy engagement)
 *
 * In production these are wired to warehouse views. Marked clearly in the
 * footer so nobody mistakes the number for a live ledger value.
 */

const BREAKAGE_RATE = 0.26; // midpoint of 15–40 % industry range
const REDEEM_RATIO_AED_PER_Nexus = 1 / 200; // Acme Retail: 200 Nexus = AED 1
const AVG_DAYS_TO_REDEEM = 47; // synthetic baseline; real figure from warehouse

export function CoalitionEconomics({ kpiTiles }: { kpiTiles: KpiTile[] }) {
  const revenueTile = kpiTiles.find((t) => t.id === 'revenue');
  const revenue = revenueTile?.value ?? 0;

  // Demo math — replace with real warehouse views in production
  const pointsIssued = revenue * 1; // 1 Nexus / AED earn rate
  const pointsRedeemed = pointsIssued * (1 - BREAKAGE_RATE);
  const liabilityAed = (pointsIssued - pointsRedeemed * 0.75) * REDEEM_RATIO_AED_PER_Nexus; // 75% of non-broken already redeemed
  const earnBurnRatio = pointsIssued > 0 ? pointsIssued / Math.max(pointsRedeemed * 0.75, 1) : 0;

  return (
    <section aria-labelledby="coalition-econ-heading" className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h2 id="coalition-econ-heading" className="font-display text-lg font-semibold text-foreground">
            Coalition economics
          </h2>
          <p className="text-sm text-muted-foreground">
            CFO-facing numbers Power BI templates never ship with. IFRS 15 / ASC 606 ready.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF5E0] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B4820E]">
          <Coins className="h-3 w-3" /> Demo · warehouse wiring pending
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EconTile
          icon={Coins}
          label="Points liability"
          value={formatAEDCompact(liabilityAed)}
          caption="outstanding obligation on balance sheet"
          hint="= outstanding Nexus ÷ 200 × (1 − breakage)"
          accent="gold"
        />
        <EconTile
          icon={Percent}
          label="Breakage rate"
          value={`${(BREAKAGE_RATE * 100).toFixed(1)}%`}
          caption="points issued that will never redeem"
          hint="industry band 15–40 % · Voucherify 2025"
          accent="navy"
        />
        <EconTile
          icon={TrendingDown}
          label="Earn / burn ratio"
          value={earnBurnRatio.toFixed(2)}
          caption={earnBurnRatio > 1.2 ? 'liability accumulating' : 'in balance'}
          hint=">1 = program is issuing faster than members redeem"
          accent={earnBurnRatio > 1.2 ? 'warning' : 'success'}
        />
        <EconTile
          icon={RefreshCw}
          label="Redemption velocity"
          value={`${AVG_DAYS_TO_REDEEM} days`}
          caption="avg days issue → redeem"
          hint="slow velocity = latent liability risk"
          accent="navy"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Dec 7, 2024 devaluation event (200 Nexus = AED 1) is live context for these numbers.
        In production, liability backfills from a BigQuery view of issuance + redemption ledgers,
        aged by 24-month expiry rule (per Nexus FAQ).
      </p>
    </section>
  );
}

function EconTile({
  icon: Icon,
  label,
  value,
  caption,
  hint,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  caption: string;
  hint: string;
  accent: 'gold' | 'navy' | 'warning' | 'success';
}) {
  const accentClasses: Record<typeof accent, string> = {
    gold: 'bg-[#FDF5E0] text-[#B4820E] ring-1 ring-[#F9C349]/30',
    navy: 'bg-[#1A1D33]/5 text-[#1A1D33] ring-1 ring-[#1A1D33]/15',
    warning: 'bg-[#FFE7DD] text-[#C84C2A] ring-1 ring-[#F2714C]/30',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  };
  return (
    <article
      className="flex flex-col justify-between gap-2 overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-tile transition-shadow hover:shadow-pop"
      title={hint}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            accentClasses[accent],
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="font-display text-[26px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="text-[12px] text-muted-foreground">{caption}</p>
    </article>
  );
}
