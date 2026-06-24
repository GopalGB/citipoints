'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Code2, Database, FileSpreadsheet, LayoutDashboard, Presentation, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AnalystDeck } from '@/components/analyst/analyst-deck';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type AnalystView = 'workspace' | 'deck';
const VIEW_STORAGE_KEY = 'nexus:analyst-view';

/**
 * Analyst shell — same warehouse + metrics as Ops, plus SQL view + exports +
 * drill-through. Offers a workspace view (cards + roadmap) and a presenter deck
 * (7-slide model scorecards · SQL audit · SHAP · price tiers · basket rules ·
 * tier flow · drill-through).
 */
export default function AnalystPage() {
  const [view, setView] = useState<AnalystView>('workspace');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'workspace' || stored === 'deck') setView(stored);
  }, []);

  const pickView = (v: AnalystView) => {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  const basketQuery = useQuery({
    queryKey: ['analyst-basket'],
    queryFn: () => api.basketRules({ min_support: 0.01, min_confidence: 0.3, limit: 20 }),
  });
  const tierFlowQuery = useQuery({
    queryKey: ['analyst-tier-flow'],
    queryFn: () => api.tierMigration(),
  });
  const churnQuery = useQuery({
    queryKey: ['analyst-churn'],
    queryFn: () => api.churn(50),
  });

  if (view === 'deck') {
    return (
      <AnalystDeck
        basketRules={basketQuery.data}
        tierFlow={tierFlowQuery.data}
        churn={churnQuery.data}
        topSlot={<AnalystViewSwitcher view={view} onChange={pickView} />}
      />
    );
  }

  return (
    <div className="animate-fade-up space-y-8">
      <AnalystViewSwitcher view={view} onChange={pickView} />

      <section className="rounded-2xl border border-border bg-nexus-navy p-8 text-white">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F9C349] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0F1120]">
            <Code2 className="h-3 w-3" />
            Analyst mode
          </span>
          <Badge variant="outline" className="border-white/20 text-white/80">
            Same warehouse as Exec + Ops
          </Badge>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Deep views · raw SQL · exports · points math
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          The analyst workspace an analyst needs — same warehouse as Exec + Ops, plus SQL audit
          trails, drill-through to member rows, CSV/Parquet exports, model-explainability panels,
          and the Nexus points-math reference so any analyst can reproduce the CXO numbers.
        </p>
      </section>

      {/* POINTS MATH REFERENCE — canonical equations shared with /executive */}
      <section className="rounded-2xl border border-[#F9C349]/30 bg-[#FDF5E0] p-6 shadow-tile">
        <header className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
            Points math reference
          </span>
          <span className="text-[11px] text-[#6F4D0A]">
            Canonical. Reproduces every Nexus number on /executive.
          </span>
        </header>
        <div className="mt-4 grid auto-rows-fr gap-3 md:grid-cols-3">
          <div className="min-h-[108px] rounded-lg border border-[#F9C349]/40 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
              Issued &amp; redeemed
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">{`pointsIssued    = kpi.points_earned
                  (fallback = revenue × 1)
pointsRedeemed  = kpi.points_redeemed
redemptionRate  = kpi.redemption_rate
                  = pointsRedeemed / pointsIssued`}</pre>
          </div>
          <div className="min-h-[108px] rounded-lg border border-[#F9C349]/40 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
              Liability &amp; breakage
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">{`BREAKAGE_RATE       = 0.26
POINTS_PER_AED      = 200
pointsOutstanding   = issued - redeemed
expectedFutureBurn  = issued × (1 - breakage)
                      - redeemed
liability (AED)     = expectedFutureBurn
                      / POINTS_PER_AED`}</pre>
          </div>
          <div className="min-h-[108px] rounded-lg border border-[#F9C349]/40 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
              Earn / burn ratio
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">{`earnBurn = pointsIssued
           / pointsRedeemed

> 2× = liability building
~ 1× = balanced
< 1× = burning down backlog`}</pre>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#6F4D0A]">
          Earn rule: 1 Nexus per AED spent at a partner. Redemption rule: 200 Nexus = AED 1 at
          checkout. Expiry: 24 months on unused points (breakage baseline 26% — Voucherify 2025).
          IFRS 15 requires the liability to sit on the balance sheet.
        </p>
      </section>

      <div className="grid auto-rows-fr gap-4 md:grid-cols-3">
        <Card
          icon={Database}
          title="SQL audit for every chart"
          body="Click 'Why this number?' on any chart and see the DuckDB / BigQuery SQL that produced it. Copy-paste into your own editor."
          cta="Re-open Overview"
          href="/overview"
        />
        <Card
          icon={FileSpreadsheet}
          title="Exports without seat tax"
          body="CSV, Parquet, JSON for every result set. No 150K-row cap, no $24/user Copilot. Full-fidelity extracts. Audit log (below) ships a live CSV export today."
          cta="Open audit export"
          href="/audit"
        />
        <Card
          icon={Code2}
          title="Model explainability"
          body="SHAP values surfaced inline on the Churn list. See exactly which features drove each prediction for a given member."
          cta="Open Churn + CLV"
          href="/predictive"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">What ships next session</h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li>
            <span className="font-medium text-foreground">SQL console</span> — DuckDB + scoped
            BigQuery execution with param binding + history.
          </li>
          <li>
            <span className="font-medium text-foreground">Drill-through</span> — click a SKU, see
            transactions. Click a member, see full ledger.
          </li>
          <li>
            <span className="font-medium text-foreground">Notebook cards</span> — Hex-style
            annotated cells (SQL → Python → chart) for narrative reports.
          </li>
          <li>
            <span className="font-medium text-foreground">Shareable frozen links</span> — snapshot
            + PNG preview for stakeholder email.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  cta,
  href,
}: {
  icon: typeof Database;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-tile transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FDF5E0] text-[#B4820E]">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[#B4820E] group-hover:gap-2">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function AnalystViewSwitcher({
  view,
  onChange,
  floating,
}: {
  view: AnalystView;
  onChange: (v: AnalystView) => void;
  floating?: boolean;
}) {
  const options: { id: AnalystView; label: string; hint: string; icon: typeof LayoutDashboard }[] = [
    { id: 'workspace', label: 'Analyst workspace', hint: 'SQL audit · exports · explainability', icon: LayoutDashboard },
    { id: 'deck', label: 'Presenter deck', hint: 'Full-screen · keyboard · model briefing', icon: Presentation },
  ];
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3',
        floating && 'absolute left-4 top-2 z-30 mb-0 w-auto rounded-full border border-border bg-white/90 px-2 py-1 shadow-tile backdrop-blur',
      )}
    >
      <div role="tablist" aria-label="Analyst view" className="inline-flex items-center gap-1 rounded-full border border-border bg-white p-0.5">
        {options.map((o) => {
          const Icon = o.icon;
          const chosen = o.id === view;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={chosen}
              onClick={() => onChange(o.id)}
              title={o.hint}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition',
                chosen ? 'bg-[#F9C349] text-[#0F1120] shadow-[0_2px_8px_rgba(249,195,73,0.35)]' : 'text-foreground/75 hover:bg-muted',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {o.label}
            </button>
          );
        })}
      </div>
      {!floating ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[#DA9712]" />
          Same warehouse · different density for your audience
        </span>
      ) : null}
    </div>
  );
}

