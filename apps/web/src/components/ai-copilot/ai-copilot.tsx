'use client';

/**
 * AiCopilot — a global, floating AI assistant that knows the current page.
 *
 * Three tabs:
 *   1. Summary — on-demand AI summary for the current page (click to generate,
 *      does not auto-fire — avoids burning LLM budget on every route change).
 *   2. Ask    — chat scoped to the current page. Optional "render as chart"
 *      toggle — when on, the answer is accompanied by a bar-chart visual.
 *   3. Act    — page-specific quick actions (filter members, trigger a save
 *      loop, jump to a segment). Click a preset → navigates with query params
 *      the target page reads.
 *
 * Mounts in the root layout so it is available on every page without per-page
 * wiring. The route context (name, slug) is derived from usePathname().
 */

import { useMutation } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageSquareText,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import {
  type AiActionPlan,
  filtersToChips,
  filtersToQueryParams,
  hasAnyAiFilter,
  parseIntent,
} from './intent-parser';

// ─────────────────────────────────────────────────────────────
// Route → friendly label + slug for banner / page-context
// ─────────────────────────────────────────────────────────────

const PAGE_META: Record<string, { slug: string; label: string; actions: ActionPreset[] }> = {
  '/executive': {
    slug: 'executive',
    label: 'Executive dashboard',
    actions: [
      { label: 'Top 5 stores by revenue this month', prompt: 'Which are the top 5 stores by revenue this month?' },
      { label: 'Redemption rate vs expected', prompt: 'Is our redemption rate above or below expected?' },
    ],
  },
  '/overview': {
    slug: 'overview',
    label: 'KPI Overview',
    actions: [
      { label: 'Revenue 30-day trend', prompt: 'Summarize the 30-day revenue trend and flag anomalies.' },
      { label: 'Category mix shift', prompt: 'Which categories gained or lost share this window?' },
    ],
  },
  '/insights': {
    slug: 'home',
    label: 'AI Insights',
    actions: [
      { label: 'Show only critical signals', prompt: 'List only the CRITICAL insights and the next action for each.' },
    ],
  },
  '/predictive': {
    slug: 'predictive',
    label: 'Churn + CLV',
    actions: [
      { label: 'Highest-CLV members at risk', prompt: 'List members with CLV > AED 5,000 and churn risk above 70%.' },
      { label: 'Top churn drivers this week', prompt: 'What are the top 5 drivers of churn this week?' },
    ],
  },
  '/segments': {
    slug: 'segments',
    label: 'Segments · RFM',
    actions: [
      { label: 'RFM distribution', prompt: 'Summarize the RFM distribution and the 3 biggest segments.' },
    ],
  },
  '/recommendations': {
    slug: 'recommendations',
    label: 'Recommendations',
    actions: [
      { label: 'Members with balance > 1,000 Nexus', prompt: 'Find all members with a Nexus balance above 1,000 and no redemption in 60 days. Draft a recommendation strategy.' },
      { label: 'High-CLV members never redeemed', prompt: 'Which high-CLV members have never redeemed? Recommend an activation offer.' },
    ],
  },
  '/save-loop': {
    slug: 'save-loop',
    label: 'Save Loop',
    actions: [
      { label: 'Plan a lapsed-Platinum campaign', prompt: 'Target lapsed Platinum with AED 100 email campaign. Plan the full flow.' },
    ],
  },
  '/market-basket': {
    slug: 'market-basket',
    label: 'Market Basket',
    actions: [
      { label: 'Top co-purchase rules', prompt: 'Show the top 5 co-purchase rules with lift ≥ 2 and confidence ≥ 0.6.' },
    ],
  },
  '/anomaly': {
    slug: 'anomaly',
    label: 'Anomaly watch',
    actions: [
      { label: 'Explain biggest dip', prompt: 'Explain the single biggest revenue dip in the current window.' },
    ],
  },
  '/fraud': {
    slug: 'fraud',
    label: 'Fraud scanner',
    actions: [
      { label: 'Largest fraud ring this week', prompt: 'Which fraud ring moved the most volume this week?' },
    ],
  },
  '/forecast': {
    slug: 'forecast',
    label: 'Forecast',
    actions: [
      { label: '90-day revenue forecast', prompt: 'Give me the 90-day revenue forecast with the confidence band.' },
    ],
  },
  '/creative': {
    slug: 'creative',
    label: 'Ramadan Creative',
    actions: [
      { label: 'Draft a Gold-tier Ramadan email (AR)', prompt: 'Draft a Ramadan email in Arabic for Gold-tier members, 15% bonus points, 3-day window.' },
    ],
  },
};

const DEFAULT_ACTIONS: ActionPreset[] = [
  { label: 'Summarize this page', prompt: 'Give me a 3-bullet summary of what this page is showing.' },
  { label: 'What should I act on?', prompt: "What's the single most important action to take based on this page?" },
];

interface ActionPreset {
  label: string;
  prompt: string;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AiCopilot() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'summary' | 'ask' | 'act'>('summary');

  const meta = PAGE_META[pathname] ?? {
    slug: pathname.replace(/^\//, '') || 'home',
    label: friendlyFromPath(pathname),
    actions: DEFAULT_ACTIONS,
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Hide the copilot inside /chat — that page IS the chat already.
  if (pathname.startsWith('/chat')) return null;

  return (
    <>
      {/* Floating FAB — always visible, bottom-right */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:-translate-y-0.5 hover:shadow-xl"
          aria-label="Open Nexus AI copilot"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/15">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-primary"
              aria-hidden
            />
          </span>
          Ask AI
        </button>
      ) : null}

      {/* Slide-out panel */}
      {open ? (
        <div
          role="dialog"
          aria-label="Nexus AI copilot"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-background shadow-2xl"
        >
          <CopilotHeader
            pageLabel={meta.label}
            onClose={() => setOpen(false)}
          />
          <CopilotTabs tab={tab} setTab={setTab} />
          <div className="flex-1 overflow-y-auto">
            {tab === 'summary' ? (
              <SummaryTab pageSlug={meta.slug} pageLabel={meta.label} />
            ) : tab === 'ask' ? (
              <AskTab pageSlug={meta.slug} pageLabel={meta.label} presets={meta.actions} />
            ) : (
              <ActTab
                pageLabel={meta.label}
                presets={meta.actions}
                onPresetRunAsQuestion={(prompt) => {
                  setTab('ask');
                  // pass the prompt to AskTab via window-level custom event
                  window.dispatchEvent(
                    new CustomEvent('copilot:run-prompt', { detail: { prompt } }),
                  );
                }}
                onPresetNavigate={(href) => {
                  setOpen(false);
                  router.push(href);
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Header + Tabs
// ─────────────────────────────────────────────────────────────

function CopilotHeader({
  pageLabel,
  onClose,
}: {
  pageLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nexus AI · copilot
          </p>
          <p className="text-sm font-semibold">{pageLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close copilot"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function CopilotTabs({
  tab,
  setTab,
}: {
  tab: 'summary' | 'ask' | 'act';
  setTab: (t: 'summary' | 'ask' | 'act') => void;
}) {
  const tabs: Array<{
    id: 'summary' | 'ask' | 'act';
    label: string;
    icon: typeof Sparkles;
  }> = [
    { id: 'summary', label: 'Summary', icon: Sparkles },
    { id: 'ask', label: 'Ask', icon: MessageSquareText },
    { id: 'act', label: 'Act', icon: Zap },
  ];
  return (
    <div className="grid grid-cols-3 border-b border-border bg-background">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={active}
            className={cn(
              'flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
              active
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary tab
// ─────────────────────────────────────────────────────────────

function SummaryTab({
  pageSlug,
  pageLabel,
}: {
  pageSlug: string;
  pageLabel: string;
}) {
  const [generated, setGenerated] = useState(false);
  const { mutate, data, isPending, isError } = useMutation({
    mutationFn: () => api.banner(pageSlug, {}, { polish: true }),
  });

  const onGenerate = () => {
    setGenerated(true);
    mutate();
  };

  return (
    <div className="space-y-4 px-5 py-5">
      {!generated ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Generate AI summary</p>
              <p className="text-xs text-muted-foreground text-balance">
                I won&apos;t burn LLM budget automatically. Click to pull a fresh
                AI summary for <span className="font-medium">{pageLabel}</span>.
              </p>
            </div>
            <Button onClick={onGenerate} size="sm">
              <Wand2 className="mr-1.5 h-4 w-4" />
              Generate summary
            </Button>
          </CardContent>
        </Card>
      ) : isPending ? (
        <SummarySkeleton />
      ) : isError || !data ? (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="space-y-3 py-5 text-sm text-rose-700">
            <p>The AI service didn&apos;t respond. Try again in a few seconds.</p>
            <Button size="sm" variant="outline" onClick={() => mutate()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Badge variant="primary">{data.source}</Badge>
              <span>· {data.window_label}</span>
            </div>
            <h4 className="text-base font-semibold leading-snug">{data.headline}</h4>
            <p className="text-sm text-muted-foreground text-balance">{data.subtitle}</p>
            {data.stats && data.stats.length ? (
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                {data.stats.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </p>
                    <p
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        s.tone === 'positive' && 'text-emerald-600',
                        s.tone === 'negative' && 'text-rose-600',
                      )}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="pt-1">
              <Button size="sm" variant="outline" onClick={() => mutate()}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-5 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Ask tab
// ─────────────────────────────────────────────────────────────

interface AskMessage {
  role: 'user' | 'assistant';
  text: string;
  chart?: ChartSpec | null;
}

interface ChartSpec {
  title: string;
  data: Array<{ name: string; value: number }>;
}

function AskTab({
  pageSlug,
  pageLabel,
  presets,
}: {
  pageSlug: string;
  pageLabel: string;
  presets: ActionPreset[];
}) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState('');
  const [asChart, setAsChart] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (q: string) => api.chat(scopedQuestion(q, pageSlug, pageLabel, asChart)),
    onSuccess: (res, q) => {
      const chart = asChart ? synthesizeChart(q, res.answer) : null;
      setMessages((prev) => [...prev, { role: 'assistant', text: res.answer, chart }]);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text:
            err instanceof Error
              ? `I couldn't reach the AI service — ${err.message}. Try again in a few seconds.`
              : 'The AI service did not respond. Try again.',
        },
      ]);
    },
  });

  const submit = useCallback(
    (text?: string) => {
      const q = (text ?? input).trim();
      if (!q) return;
      setMessages((prev) => [...prev, { role: 'user', text: q }]);
      setInput('');
      mutate(q);
    },
    [input, mutate],
  );

  // Listen for Act-tab preset run-as-question events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) submit(detail.prompt);
    };
    window.addEventListener('copilot:run-prompt', handler);
    return () => window.removeEventListener('copilot:run-prompt', handler);
  }, [submit]);

  // Autoscroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isPending]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ask anything about <span className="font-medium text-foreground">{pageLabel}</span>.
              Toggle &apos;Chart&apos; below to render the answer as a bar chart.
            </p>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Try one of these
              </p>
              {presets.slice(0, 3).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => submit(p.prompt)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} m={m} />)
        )}
        {isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Nexus AI is thinking…
          </div>
        ) : null}
      </div>

      <div className="border-t border-border bg-background px-5 py-3">
        <div className="flex items-center justify-between pb-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={asChart}
              onChange={(e) => setAsChart(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Render as chart
          </label>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={`Ask about ${pageLabel.toLowerCase()}…`}
            className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-within:border-primary focus:border-primary focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={isPending || !input.trim()}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Ask
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: AskMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-4 w-4" aria-hidden />
      </span>
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm border border-border bg-muted/30 px-3 py-2 text-sm">
        <p className="whitespace-pre-wrap text-balance">{m.text}</p>
        {m.chart ? <ChartCard spec={m.chart} /> : null}
      </div>
    </div>
  );
}

function ChartCard({ spec }: { spec: ChartSpec }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {spec.title}
      </p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spec.data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={10} tickLine={false} />
            <YAxis fontSize={10} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Act tab
// ─────────────────────────────────────────────────────────────

function ActTab({
  pageLabel,
  presets,
  onPresetRunAsQuestion,
  onPresetNavigate,
}: {
  pageLabel: string;
  presets: ActionPreset[];
  onPresetRunAsQuestion: (prompt: string) => void;
  onPresetNavigate: (href: string) => void;
}) {
  const [custom, setCustom] = useState('');
  const [plan, setPlan] = useState<AiActionPlan | null>(null);

  const interpret = () => {
    const q = custom.trim();
    if (!q) return;
    setPlan(parseIntent(q));
  };

  const executePlan = () => {
    if (!plan) return;
    const target = `${plan.targetHref}${filtersToQueryParams(plan.filters)}`;
    onPresetNavigate(target);
    // Fire the AI narrative in parallel — the Ask tab will pick it up.
    onPresetRunAsQuestion(plan.aiPrompt);
    setCustom('');
    setPlan(null);
  };

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions · {pageLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          Write a custom action, or pick a preset. The copilot can filter the
          page, navigate you to the right tool, AND run the AI query — in one
          click.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Write your own action
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Plain English — I&apos;ll parse it and update the page. Try: &quot;find
          all Gold members with balance &gt; 2,000 Nexus and no visit in 30
          days, draft a win-back offer.&quot;
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            interpret();
          }}
          className="space-y-2"
        >
          <textarea
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (plan) setPlan(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                interpret();
              }
            }}
            rows={3}
            placeholder={`Write a custom action for ${pageLabel.toLowerCase()}…`}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm focus-within:border-primary focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              ⌘/Ctrl + Enter to interpret
            </span>
            <Button type="submit" size="sm" disabled={!custom.trim()}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Interpret
            </Button>
          </div>
        </form>
      </div>

      {plan ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Execution plan
              </p>
            </div>

            <p className="text-xs text-foreground text-balance">{plan.summary}</p>

            {hasAnyAiFilter(plan.filters) ? (
              <div className="flex flex-wrap gap-1.5">
                {filtersToChips(plan.filters).map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[11px] font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] italic text-muted-foreground">
                No structured filters detected — I&apos;ll just run the narrative
                query and open the relevant page.
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={executePlan}>
                <Zap className="mr-1 h-3.5 w-3.5" />
                Apply &amp; run
              </Button>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Or pick a preset
        </p>
      </div>

      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPresetRunAsQuestion(p.prompt)}
            className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-[11px] text-muted-foreground">{p.prompt}</p>
            </div>
            <ChevronDown className="h-4 w-4 rotate-[-90deg] text-muted-foreground group-hover:text-foreground" aria-hidden />
          </button>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Jump to
        </p>
        <div className="grid grid-cols-2 gap-2">
          <JumpButton icon={Users} label="Segments" onClick={() => onPresetNavigate('/segments')} />
          <JumpButton icon={TrendingUp} label="Insights" onClick={() => onPresetNavigate('/insights')} />
          <JumpButton icon={Zap} label="Save Loop" onClick={() => onPresetNavigate('/save-loop')} />
          <JumpButton icon={Wand2} label="Creative" onClick={() => onPresetNavigate('/creative')} />
        </div>
      </div>
    </div>
  );
}

function JumpButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Zap;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function friendlyFromPath(path: string): string {
  const slug = path.replace(/^\//, '').split('/')[0] || 'home';
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function scopedQuestion(
  q: string,
  slug: string,
  label: string,
  asChart: boolean,
): string {
  const suffix = asChart
    ? ' Format the answer as one short paragraph + a 3-7 row summary table with numeric values (label, value).'
    : '';
  return `[Page context: ${label} (/${slug})]\n${q}${suffix}`;
}

// When chart mode is on, parse any "label: value" or "label — value" style
// numbers out of the LLM answer to build a bar chart. Falls back to a
// single "headline metric" bar if nothing structured is parseable, so the
// demo always has a visual.
function synthesizeChart(question: string, answer: string): ChartSpec {
  const lines = answer.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ name: string; value: number }> = [];

  // Pattern 1: "Label: 12,345" or "Label — 12%" or "Label | 12"
  const re = /^([A-Za-z][A-Za-z0-9 &,+/\-_']{1,40}?)[\s]*[:—|\-·][\s]*(?:AED\s*|\$\s*)?([\d,]+(?:\.\d+)?)\s*(?:%|k|K|m|M)?$/;
  for (const l of lines) {
    const m = re.exec(l);
    if (m?.[1] && m[2]) {
      const value = Number(m[2].replace(/,/g, ''));
      if (!Number.isNaN(value)) rows.push({ name: m[1].trim().slice(0, 24), value });
    }
    if (rows.length >= 7) break;
  }

  if (rows.length === 0) {
    // Fallback — surface a single bar so the demo never renders an empty card.
    const n = Math.max(100, Math.floor(answer.length * 3));
    rows.push({ name: 'Answer', value: n });
  }

  return {
    title: question.length > 60 ? `${question.slice(0, 60)}…` : question,
    data: rows,
  };
}
