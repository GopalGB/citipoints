'use client';

import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  BrainCircuit,
  Coins,
  Cpu,
  Crown,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  HeartPulse,
  Layers,
  LineChart,
  MessageSquareText,
  Network,
  PackageSearch,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type CommandItem = {
  id: string;
  title: string;
  hint?: string;
  group:
    | 'Boardroom'
    | 'KPI Overview'
    | 'KPI Trends'
    | 'Category Performance'
    | 'Customer Analytics'
    | 'Forecast & Flow'
    | 'Intelligence'
    | 'Operations'
    | 'Governance'
    | 'Assistant'
    | 'Jump to metric'
    | 'Help';
  icon: typeof Gauge;
  href?: string;
  onSelect?: () => void;
  keywords?: string[];
};

/**
 * Linear/Raycast-grade command palette. Cmd+K or Ctrl+K opens; typing filters
 * fuzz-style (every word must match title/hint/keywords). Arrow keys navigate,
 * Enter fires, Escape closes.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K toggles; escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (modifier && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === '/' && !open) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus input on open; reset on close
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(
    () => [
      // Boardroom
      { id: 'executive', title: 'Executive · CXO deck', hint: 'CEO/CFO/CMO lens · board-ready', group: 'Boardroom', icon: Crown, href: '/executive', keywords: ['cxo', 'exec', 'board', 'ceo', 'cfo', 'cmo'] },
      { id: 'analyst', title: 'Analyst workbench', hint: 'SQL · exports · SHAP', group: 'Boardroom', icon: BrainCircuit, href: '/analyst', keywords: ['sql', 'export', 'shap', 'explain'] },

      // KPI Overview
      { id: 'home', title: 'Overview', hint: 'KPIs · revenue · mix', group: 'KPI Overview', icon: Gauge, href: '/overview', keywords: ['dashboard', 'kpi', 'home', 'pulse'] },

      // KPI Trends
      { id: 'loyalty', title: 'Loyalty vs Non-loyalty', hint: 'Split trend + ATV · repeat', group: 'KPI Trends', icon: Sparkles, href: '/loyalty', keywords: ['loyalty', 'non-loyalty', 'split', 'trend'] },
      { id: 'cohort', title: 'Cohorts', hint: 'Retention heatmap', group: 'KPI Trends', icon: LineChart, href: '/cohort', keywords: ['retention', 'cohort', 'heatmap'] },
      { id: 'anomaly', title: 'Anomaly watch', hint: 'Unusual revenue days', group: 'KPI Trends', icon: Activity, href: '/anomaly', keywords: ['stl', 'outlier', 'anomaly'] },

      // Category Performance
      { id: 'market-basket', title: 'Market Basket', hint: 'What sells together', group: 'Category Performance', icon: PackageSearch, href: '/market-basket', keywords: ['bundle', 'affinity', 'fp-growth', 'lift'] },
      { id: 'price-tiers', title: 'Price tiers', hint: 'Spend by price band', group: 'Category Performance', icon: Layers, href: '/price-tiers', keywords: ['price', 'tier', 'bucket', 'band'] },
      { id: 'stores', title: 'Stores', hint: 'Ranking · penetration', group: 'Category Performance', icon: Store, href: '/stores', keywords: ['store', 'branch', 'acme'] },

      // Customer Analytics
      { id: 'segments', title: 'Segments · RFM · Repeat', hint: 'RFM + KMeans + repeat-rate', group: 'Customer Analytics', icon: Users, href: '/segments', keywords: ['rfm', 'cluster', 'kmeans', 'repeat'] },
      { id: 'tier', title: 'Tier Migration', hint: 'Gold ↔ Platinum flow', group: 'Customer Analytics', icon: Network, href: '/tier-migration', keywords: ['sankey', 'tier', 'migration'] },
      { id: 'predictive', title: 'Churn + CLV', hint: 'At-risk + lifetime value', group: 'Customer Analytics', icon: Target, href: '/predictive', keywords: ['churn', 'clv', 'risk'] },
      { id: 'recs', title: 'Recommendations', hint: 'Hybrid offers', group: 'Customer Analytics', icon: BrainCircuit, href: '/recommendations', keywords: ['next-best-action', 'nba'] },

      // Forecast & Flow
      { id: 'forecast', title: 'Forecast', hint: 'Revenue + liability · Ramadan / Eid overlays', group: 'Forecast & Flow', icon: TrendingUp, href: '/forecast', keywords: ['prophet', 'forecast', 'ramadan', 'eid', 'liability', 'scenario'] },
      { id: 'coalition-flow', title: 'Coalition flow (Sankey)', hint: 'Earn → Redeem · cross-category', group: 'Forecast & Flow', icon: Network, href: '/coalition-flow', keywords: ['sankey', 'earn', 'redeem', 'flow', 'burn'] },
      { id: 'elasticity', title: 'Elasticity simulator', hint: 'Earn / redeem / breakage what-if', group: 'Forecast & Flow', icon: Scale, href: '/elasticity', keywords: ['elasticity', 'pricing', 'simulator', 'what-if', 'sensitivity'] },

      // Intelligence — AI-native
      { id: 'alerts', title: 'Alerts feed', hint: 'Proactive AI alerts with NL narrative', group: 'Intelligence', icon: Bell, href: '/alerts', keywords: ['alerts', 'anomaly', 'notify', 'proactive'] },
      { id: 'experiments', title: 'Experiments · A/B ledger', hint: 'SRM · sequential stop · causal lift', group: 'Intelligence', icon: FlaskConical, href: '/experiments', keywords: ['ab', 'experiments', 'holdout', 'srm', 'causal', 'lift'] },
      { id: 'benchmarks', title: 'Peer benchmarks', hint: 'vs MENA coalition peers · 11 programs', group: 'Intelligence', icon: BarChart2, href: '/benchmarks', keywords: ['benchmarks', 'peers', 'industry', 'comparison'] },
      { id: 'fraud', title: 'Fraud scanner', hint: 'Cross-partner anomalous redemption', group: 'Intelligence', icon: ShieldAlert, href: '/fraud', keywords: ['fraud', 'abuse', 'anomaly', 'shap'] },

      // Operations
      { id: 'app-health', title: 'App health · Support', hint: 'Crash-free · OTP · tickets · POS', group: 'Operations', icon: HeartPulse, href: '/app-health', keywords: ['app', 'crash', 'support', 'tickets', 'otp', 'pos', 'ops'] },

      // Governance
      { id: 'compliance', title: 'Compliance (PDPL)', hint: 'Consent · DSR · breaches · 2027 deadline', group: 'Governance', icon: ShieldCheck, href: '/compliance', keywords: ['pdpl', 'gdpr', 'consent', 'dsr', 'breach', 'compliance'] },
      { id: 'ifrs', title: 'IFRS 15 quarterly close', hint: 'Points-liability waterfall · audit brief', group: 'Governance', icon: FileCheck2, href: '/ifrs', keywords: ['ifrs', 'close', 'liability', 'quarterly', 'audit', 'finance'] },
      { id: 'models', title: 'Model cards', hint: 'ML transparency · drift · audit', group: 'Governance', icon: Cpu, href: '/models', keywords: ['ml', 'models', 'transparency', 'drift', 'audit', 'auc', 'xgboost', 'clv'] },
      { id: 'catalog', title: 'Data catalog · semantic layer', hint: 'ATV · AMS · MAU · HHI · CLV · breakage', group: 'Governance', icon: BookOpen, href: '/catalog', keywords: ['catalog', 'semantic', 'metrics', 'definitions', 'dbt', 'glossary'] },
      { id: 'audit', title: 'Audit log', hint: 'User + data lineage events · PDPL Art. 13', group: 'Governance', icon: FileText, href: '/audit', keywords: ['audit', 'log', 'lineage', 'events', 'pdpl'] },

      // Assistant
      { id: 'save-loop', title: 'Save Loop', hint: 'Agentic churn-save · close the loop', group: 'Assistant', icon: Zap, href: '/save-loop', keywords: ['agent', 'save', 'churn', 'causal', 'lift', 'holdout', 'campaign'] },
      { id: 'chat', title: 'Ask Nexus AI', hint: 'Natural-language Q&A', group: 'Assistant', icon: MessageSquareText, href: '/chat', keywords: ['claude', 'copilot', 'ai'] },

      // Jump to metric (scroll-to on Overview)
      { id: 'm-revenue', title: 'Jump to Revenue trend', group: 'Jump to metric', icon: LineChart, href: '/overview#revenue-trend', keywords: ['aed', 'revenue'] },
      { id: 'm-mix', title: 'Jump to Category mix', group: 'Jump to metric', icon: PackageSearch, href: '/overview#category-mix', keywords: ['category', 'mix'] },
      { id: 'm-store', title: 'Jump to Store performance', group: 'Jump to metric', icon: Users, href: '/overview#store-performance', keywords: ['store', 'branch', 'acme'] },
      { id: 'm-tier', title: 'Jump to Tier distribution', group: 'Jump to metric', icon: Network, href: '/overview#tier-distribution', keywords: ['tier', 'distribution'] },
      { id: 'm-top', title: 'Jump to Top products', group: 'Jump to metric', icon: PackageSearch, href: '/overview#top-products', keywords: ['sku', 'product'] },
      { id: 'm-liability', title: 'Jump to Points Liability (AED)', group: 'Jump to metric', icon: Coins, href: '/overview#kpi-heading', keywords: ['liability', 'ifrs', 'breakage'] },

      // Help
      { id: 'shortcuts', title: 'Keyboard shortcuts', hint: '⌘K palette · / search · Esc close', group: 'Help', icon: Sparkles },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const tokens = q.split(/\s+/);
    return items.filter((it) => {
      const hay = `${it.title} ${it.hint ?? ''} ${(it.keywords ?? []).join(' ')}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [items, query]);

  // Group preserving order
  const groups = useMemo(() => {
    const order: CommandItem['group'][] = [
      'Boardroom',
      'KPI Overview',
      'KPI Trends',
      'Category Performance',
      'Customer Analytics',
      'Forecast & Flow',
      'Intelligence',
      'Operations',
      'Governance',
      'Assistant',
      'Jump to metric',
      'Help',
    ];
    const result: { group: CommandItem['group']; items: CommandItem[] }[] = [];
    for (const g of order) {
      const it = filtered.filter((i) => i.group === g);
      if (it.length) result.push({ group: g, items: it });
    }
    return result;
  }, [filtered]);

  const flatOrdered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const fire = useCallback(
    (it: CommandItem | undefined) => {
      if (!it) return;
      if (it.href) {
        router.push(it.href);
      }
      it.onSelect?.();
      setOpen(false);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatOrdered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      fire(flatOrdered[cursor]);
    }
  };

  if (!open) return null;

  let globalIdx = -1;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[#0F1120]/55 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to a page, metric, or ask…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Command palette input"
            autoFocus
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {groups.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results. Try another query.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.group} className="pb-2">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {g.group}
                </p>
                <ul>
                  {g.items.map((it) => {
                    globalIdx += 1;
                    const active = globalIdx === cursor;
                    const Icon = it.icon;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(globalIdx)}
                          onClick={() => fire(it)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                            active ? 'bg-[#FDF5E0] text-foreground' : 'text-foreground/80',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                              active ? 'bg-[#F9C349] text-[#0F1120]' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{it.title}</span>
                            {it.hint ? (
                              <span className="truncate text-[11px] text-muted-foreground">
                                {it.hint}
                              </span>
                            ) : null}
                          </span>
                          {active ? (
                            <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
                              ↵
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface px-1.5 font-mono text-[10px]">↑↓</kbd>
            navigate
            <kbd className="ml-2 rounded border border-border bg-surface px-1.5 font-mono text-[10px]">↵</kbd>
            select
          </span>
          <span>
            <kbd className="rounded border border-border bg-surface px-1.5 font-mono text-[10px]">⌘K</kbd>
            <span className="ml-1">to toggle</span>
          </span>
        </div>
      </div>
    </div>
  );
}
