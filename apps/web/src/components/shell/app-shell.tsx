'use client';

import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  Crown,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  HeartPulse,
  LineChart,
  MessageSquareText,
  Microscope,
  Moon,
  Network,
  PackageSearch,
  Receipt,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { AiFilterStrip } from '@/components/ai-copilot/ai-filter-strip';
import { NexusLogo, NexusMark, PoweredByCiti } from '@/components/brand/nexus-logo';
import { PartnerSwitcher } from '@/components/shell/partner-switcher';
import { PersonaSwitcher } from '@/components/shell/persona-switcher';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Non-critical overlays — dynamically loaded after initial paint to trim
// the first-load bundle and keep button-click latency fast. Each is only
// shown on user action (⌘K, ?, bubble click, first-visit tour).
const CommandPalette = dynamic(
  () => import('@/components/shell/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
);
const ShortcutsOverlay = dynamic(
  () => import('@/components/shell/shortcuts-overlay').then((m) => m.ShortcutsOverlay),
  { ssr: false },
);
const ChartAnnotations = dynamic(
  () => import('@/components/annotations/chart-annotations').then((m) => m.ChartAnnotations),
  { ssr: false },
);
const ProductTour = dynamic(
  () => import('@/components/tour/product-tour').then((m) => m.ProductTour),
  { ssr: false },
);

type NavGroup =
  | 'Boardroom'
  | 'KPI Overview'
  | 'KPI Trends'
  | 'Category Performance'
  | 'Customer Analytics'
  | 'Forecast & Flow'
  | 'Intelligence'
  | 'Operations'
  | 'Governance'
  | 'Assistant';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  hint?: string;
  group: NavGroup;
};

const NAV_ITEMS: NavItem[] = [
  // Boardroom — exec-grade views
  { href: '/executive', label: 'Executive', icon: Crown, hint: 'CXO · CEO/CFO/CMO lens', group: 'Boardroom' },
  { href: '/analyst', label: 'Analyst', icon: Microscope, hint: 'SQL · exports · SHAP', group: 'Boardroom' },

  // KPI Overview — the one-screen pulse (was `/` — now routed to /overview so
  // `/` can redirect to /executive as the default landing view)
  { href: '/overview', label: 'Overview', icon: Gauge, hint: 'KPIs · revenue · mix', group: 'KPI Overview' },

  // KPI Trends — time-series + anomalies
  { href: '/loyalty', label: 'Loyalty split', icon: Sparkles, hint: 'Loyalty vs Non-loyalty', group: 'KPI Trends' },
  { href: '/cohort', label: 'Cohorts', icon: LineChart, hint: 'Retention heatmap', group: 'KPI Trends' },
  { href: '/anomaly', label: 'Anomaly watch', icon: Activity, hint: 'Unusual revenue days', group: 'KPI Trends' },

  // Category Performance — what sells where at what price
  { href: '/market-basket', label: 'Market Basket', icon: PackageSearch, hint: 'What sells together', group: 'Category Performance' },
  { href: '/price-tiers', label: 'Price tiers', icon: Target, hint: 'Spend by price band', group: 'Category Performance' },
  { href: '/stores', label: 'Stores', icon: Store, hint: 'Ranking · penetration', group: 'Category Performance' },

  // Customer Analytics — RFM, Repeat, tiering, lifetime value
  { href: '/segments', label: 'Segments · RFM · Repeat', icon: Users, hint: 'RFM + KMeans + repeat', group: 'Customer Analytics' },
  { href: '/tier-migration', label: 'Tier Migration', icon: Network, hint: 'Gold ↔ Platinum flow', group: 'Customer Analytics' },
  { href: '/predictive', label: 'Churn + CLV', icon: Target, hint: 'Who to save · who to grow', group: 'Customer Analytics' },
  { href: '/recommendations', label: 'Recommendations', icon: BrainCircuit, hint: 'Hybrid offers engine', group: 'Customer Analytics' },

  // Forecast & Flow — the what-next layer
  { href: '/forecast', label: 'Forecast', icon: TrendingUp, hint: 'Revenue + liability · Ramadan overlay', group: 'Forecast & Flow' },
  { href: '/coalition-flow', label: 'Coalition flow', icon: Network, hint: 'Earn → Redeem Sankey', group: 'Forecast & Flow' },
  { href: '/elasticity', label: 'Elasticity simulator', icon: Scale, hint: 'Earn / redeem / breakage what-if', group: 'Forecast & Flow' },

  // Intelligence — AI-native layer
  { href: '/insights', label: 'AI Insights', icon: BrainCircuit, hint: 'Auto-generated signals across all models', group: 'Intelligence' },
  { href: '/alerts', label: 'Alerts', icon: Bell, hint: 'Proactive AI alerts feed', group: 'Intelligence' },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical, hint: 'A/B ledger · causal lift', group: 'Intelligence' },
  { href: '/benchmarks', label: 'Peer benchmarks', icon: BarChart2, hint: 'vs MENA coalition peers', group: 'Intelligence' },
  { href: '/fraud', label: 'Fraud scanner', icon: ShieldAlert, hint: 'Cross-partner anomaly feed', group: 'Intelligence' },

  // Operations — the silent pains layer
  { href: '/app-health', label: 'App health · Support', icon: HeartPulse, hint: 'Crash-free · OTP · tickets', group: 'Operations' },

  // Governance — PDPL + ML transparency
  { href: '/compliance', label: 'Compliance (PDPL)', icon: ShieldCheck, hint: 'Consent · DSR · breaches · 2027 deadline', group: 'Governance' },
  { href: '/ifrs', label: 'IFRS 15 close', icon: FileCheck2, hint: 'Quarterly points-liability close', group: 'Governance' },
  { href: '/models', label: 'Model cards', icon: Cpu, hint: 'ML transparency · drift · audit', group: 'Governance' },
  { href: '/catalog', label: 'Data catalog', icon: BookOpen, hint: 'Semantic layer · metric dictionary', group: 'Governance' },
  { href: '/audit', label: 'Audit log', icon: FileText, hint: 'Who viewed what · PDPL Art. 13', group: 'Governance' },

  // Assistant — agentic actions + NL Q&A
  { href: '/save-loop', label: 'Save Loop', icon: Zap, hint: 'Agentic · close the loop', group: 'Assistant' },
  { href: '/creative', label: 'Ramadan Creative', icon: Moon, hint: 'Arabic Gen-AI campaign agent', group: 'Assistant' },
  { href: '/chat', label: 'Ask Nexus AI', icon: MessageSquareText, hint: 'Natural-language Q&A', group: 'Assistant' },
];

const NAV_GROUPS: NavGroup[] = [
  'Boardroom',
  'KPI Overview',
  'KPI Trends',
  'Category Performance',
  'Customer Analytics',
  'Forecast & Flow',
  'Intelligence',
  'Operations',
  'Assistant',
  'Governance',
];

const COLLAPSIBLE_GROUPS: NavGroup[] = ['Governance'];
const PARTNER_DISMISS_KEY = 'nexus:partner-card-dismissed';
const GOVERNANCE_OPEN_KEY = 'nexus:governance-nav-open';

// 2026-04-26 — per Arjit's coaching call: the Nexus CXO sees just 4 routes
// in a Boardroom group. Existing 30-page Pro suite stays reachable at
// /executive (and direct URLs for /forecast, /segments etc.) via the
// "Pro view" link rendered in each Boardroom page's footer area.
const SIMPLE_NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Executive', icon: Crown, hint: 'KPIs · partners · stores', group: 'Boardroom' },
  { href: '/customers', label: 'Customers', icon: Users, hint: 'Tiers · CLV · churn · RFM', group: 'Boardroom' },
  { href: '/partners', label: 'Partners', icon: Store, hint: 'Coalition · health · SLA', group: 'Boardroom' },
  { href: '/category', label: 'Category', icon: PackageSearch, hint: 'Brand · subcategory · price tier', group: 'Boardroom' },
  { href: '/stores', label: 'Stores', icon: Network, hint: 'Penetration · weekly heatmap', group: 'Boardroom' },
  { href: '/bundles', label: 'Bundles', icon: BarChart2, hint: 'Affinity · bundle opportunity', group: 'Boardroom' },
  { href: '/outlook', label: 'Outlook', icon: TrendingUp, hint: 'Forecast · Ramadan · liability', group: 'Boardroom' },
];

const SIMPLE_NAV_GROUPS: NavGroup[] = ['Boardroom'];

const SIMPLE_ROUTES = ['/', '/customers', '/partners', '/category', '/stores', '/bundles', '/outlook'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 2026-04-26: Boardroom mode keeps ALL existing Nexus chrome — navy
  // header, gold accents, cream/dots canvas, partner spotlight card,
  // footer. We just swap the 30-item sidebar for the 4-item Boardroom nav
  // and re-point the Nexus logo at the simple home (/) instead of the
  // /executive Pro view.
  const isSimpleRoute = SIMPLE_ROUTES.includes(pathname);
  const navItems = isSimpleRoute ? SIMPLE_NAV_ITEMS : NAV_ITEMS;
  const navGroups = isSimpleRoute ? SIMPLE_NAV_GROUPS : NAV_GROUPS;
  const homeHref = isSimpleRoute ? '/' : '/executive';

  // Sidebar + footer stay on all routes including /executive now that the
  // exec page has its own internal view switcher (CXO grid vs Presenter Deck).
  // The deck handles its own full-screen framing inside main content.
  const isExecRoute = false;
  const [partnerOpen, setPartnerOpen] = useState(true);
  // Governance is a power-user/MVP section — collapsed by default; opt-in via localStorage
  const [governanceOpen, setGovernanceOpen] = useState(false);

  // Rehydrate dismissal + governance preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(PARTNER_DISMISS_KEY) === '1') {
      setPartnerOpen(false);
    }
    if (window.localStorage.getItem(GOVERNANCE_OPEN_KEY) === '1') {
      setGovernanceOpen(true);
    }
  }, []);

  // Auto-open Governance if the user navigates directly to one of its pages
  useEffect(() => {
    const governanceRoutes = ['/compliance', '/ifrs', '/models', '/catalog', '/audit'];
    if (governanceRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      setGovernanceOpen(true);
    }
  }, [pathname]);

  const toggleGovernance = () => {
    setGovernanceOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        if (next) window.localStorage.setItem(GOVERNANCE_OPEN_KEY, '1');
        else window.localStorage.removeItem(GOVERNANCE_OPEN_KEY);
      }
      return next;
    });
  };

  const dismissPartner = () => {
    setPartnerOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PARTNER_DISMISS_KEY, '1');
    }
  };
  const showPartner = () => {
    setPartnerOpen(true);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PARTNER_DISMISS_KEY);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* TOP BAR — dark navy so the white Nexus wordmark pops */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-nexus-navy backdrop-blur supports-[backdrop-filter]:bg-[#0F1120]/95">
        <div className="flex h-[64px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link
              href={homeHref}
              className="group flex items-center gap-3 rounded-lg px-1 py-1"
              aria-label="Nexus home"
            >
              <NexusLogo size="md" priority />
            </Link>
            <span className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
                Partner Analytics
              </span>
              <PoweredByCiti variant="onDark" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Power-user widgets — hidden on Boardroom routes per
                Arjit's coaching call (CXO wants Tableau-genre, not AI). */}
            {!isSimpleRoute ? <PersonaSwitcher /> : null}
            <PartnerSwitcher />
            {!isSimpleRoute ? <CommandPaletteTrigger /> : null}
            {!isSimpleRoute ? (
              <Link
                href="/chat"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F9C349] px-3 py-1.5 text-xs font-semibold text-[#0F1120] shadow-[0_6px_16px_rgba(249,195,73,0.35)] transition hover:bg-[#fbd06a]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask Nexus AI
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {!isSimpleRoute ? <CommandPalette /> : null}

      {isExecRoute ? (
        <main className="flex-1 bg-background">{children}</main>
      ) : (
      <div className="flex flex-1">
        {/* SIDEBAR — cream background with gold active markers.
            sticky + full viewport height so nav scrolls internally and the
            partner card is pinned to the bottom (no overlap with footer). */}
        <aside className="sticky top-[64px] hidden h-[calc(100vh-64px)] w-64 shrink-0 flex-col border-r border-border bg-white/70 p-3 md:flex">
          <nav aria-label="Primary" className="flex-1 overflow-y-auto pr-1">
            {navGroups.map((group) => {
              const isCollapsible = COLLAPSIBLE_GROUPS.includes(group);
              const isGovernance = group === 'Governance';
              const isOpen = !isCollapsible || (isGovernance && governanceOpen);
              const itemCount = navItems.filter((i) => i.group === group).length;
              return (
              <div key={group} className="mb-4 last:mb-0">
                {isCollapsible ? (
                  <button
                    type="button"
                    onClick={isGovernance ? toggleGovernance : undefined}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      )}
                      {group}
                      <span className="rounded-full bg-muted px-1.5 py-[1px] text-[9px] font-bold text-muted-foreground">
                        {itemCount}
                      </span>
                      <span className="rounded-full bg-[#FDF5E0] px-1.5 py-[1px] text-[8px] font-bold text-[#DA9712]">
                        MVP
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group}
                  </p>
                )}
                {isOpen ? (
                <ul className="flex flex-col gap-0.5">
                  {navItems.filter((i) => i.group === group).map((item) => {
                    const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'group relative flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                            active
                              ? 'bg-[#FDF5E0] text-foreground shadow-[inset_0_0_0_1px_rgba(249,195,73,0.35)]'
                              : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                          )}
                          aria-current={active ? 'page' : undefined}
                        >
                          {active ? (
                            <span
                              aria-hidden
                              className="absolute left-0 top-2 h-[calc(100%-16px)] w-[3px] rounded-r-full bg-gradient-to-b from-[#F9C349] to-[#DA9712]"
                            />
                          ) : null}
                          <span
                            className={cn(
                              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                              active
                                ? 'bg-[#F9C349] text-[#0F1120] shadow-sm'
                                : 'bg-muted text-muted-foreground group-hover:bg-surface group-hover:text-foreground',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className={cn('truncate font-medium', active && 'text-foreground')}>
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="truncate text-[11px] text-muted-foreground group-hover:text-foreground/80">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                ) : null}
              </div>
              );
            })}
          </nav>

          {/* Partner card — dismissible. State persisted in localStorage. */}
          {partnerOpen ? (
            <div className="mt-4 shrink-0 overflow-hidden rounded-xl border border-[#E8E5DC] bg-[#FDFCF8]">
              <div className="flex items-center justify-between gap-2 bg-nexus-navy px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
                <span className="flex items-center gap-2">
                  <NexusMark size={14} /> Coalition partner
                </span>
                <button
                  type="button"
                  onClick={dismissPartner}
                  aria-label="Dismiss partner card"
                  title="Hide partner card"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F9C349]"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
              <div className="p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">Acme Retail</p>
                <p className="mt-1">
                  55 UAE stores · <span className="font-semibold text-foreground">1 Nexus per AED</span> earn rate ·
                  partner since launch.
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  1.2M members · 35+ brands across UAE &amp; Bahrain.
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={showPartner}
              className="mt-4 inline-flex shrink-0 items-center justify-between gap-2 rounded-lg border border-[#E8E5DC] bg-white px-3 py-2 text-xs font-medium text-foreground shadow-tile transition hover:border-[#F9C349] hover:bg-[#FDF5E0]"
              aria-label="Show partner spotlight"
            >
              <span className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-[#DA9712]" aria-hidden />
                Partner: Acme Retail
              </span>
              <span aria-hidden className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Show
              </span>
            </button>
          )}
        </aside>

        {/* MAIN — cream canvas with subtle gold dots */}
        <main className="relative min-w-0 flex-1 bg-background">
          <AiFilterStrip />
          <div className="bg-nexus-dots min-h-full p-4 md:p-8">{children}</div>
        </main>
      </div>
      )}

      {/* FOOTER — hidden in exec full-screen mode */}
      {!isExecRoute ? (
        <footer className="border-t border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground md:px-6">
            <div className="flex items-center gap-2">
              <NexusLogo size="xs" variant="onLight" />
              <span aria-hidden>·</span>
              <PoweredByCiti variant="onLight" />
            </div>
            <span className="font-medium">
              City Points Loyalty Card Services LLC · Byte Vault Holdings Ltd ·
              <span className="ml-1 text-foreground">© 2026 Nexus®</span>
            </span>
            <Badge variant="outline">Next.js 15 · FastAPI · DuckDB · XGBoost · BG/NBD</Badge>
          </div>
        </footer>
      ) : null}

      {/* Per-page annotations — disabled (replaced by the Ask AI copilot). */}
      {/* <ChartAnnotations pageKey={pathname} /> */}

      {/* Press `?` anywhere to toggle the shortcuts reference */}
      <ShortcutsOverlay />

      {/* First-visit product tour — auto-dismiss, localStorage-persisted */}
      <ProductTour />
    </div>
  );
}

/**
 * Visible ⌘K hint button that opens the CommandPalette via synthetic keydown.
 * Gives non-power-users discoverability without breaking the keyboard UX.
 */
function CommandPaletteTrigger() {
  const open = () => {
    if (typeof window === 'undefined') return;
    // Dispatch a Cmd+K keydown the palette listens for.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  };
  return (
    <button
      type="button"
      onClick={open}
      className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 md:inline-flex"
      aria-label="Open command palette"
      title="Jump to anything — ⌘K"
    >
      <Search className="h-3 w-3" aria-hidden />
      <span>Jump to…</span>
      <kbd className="rounded border border-white/20 bg-white/10 px-1 font-mono text-[9px] uppercase tracking-wide">⌘K</kbd>
    </button>
  );
}
