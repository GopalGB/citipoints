'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  Play,
  Target,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatAED, formatAEDCompact } from '@/lib/format';
import type { AgentConfidence, SaveLoopResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const QUICK_PICKS = [
  'Target hibernating whales with AED 50 bonus at Acme Retail',
  'Win back Gold members who went cooling this month',
  'Boost Bronze-tier engagement before Ramadan — push channel',
  'Target lapsed Platinum with AED 100 email campaign',
];

const DEFAULT_COMMAND = QUICK_PICKS[0] ?? 'Target hibernating whales with AED 50 bonus at Acme Retail';

const CONFIDENCE_TONE: Record<AgentConfidence, 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

export default function SaveLoopPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:save-loop',
    'all',
  );
  const [command, setCommand] = useState<string>(DEFAULT_COMMAND);
  const [expandedTrace, setExpandedTrace] = useState<Record<number, boolean>>({});

  const runLoop = useMutation({
    mutationFn: (body: { command: string }) => api.saveLoopRun(body),
  });

  const data: SaveLoopResponse | undefined = runLoop.data;
  const isRunning = runLoop.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isRunning) return;
    setExpandedTrace({});
    runLoop.mutate({ command: command.trim() });
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Save window · {WINDOW_LABELS[timeWindow]}
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
        page="save-loop"
        filters={filters}
        kicker="Agent · Churn-Save Loop"
        fallbackHeadline="From insight to intervention in one conversation."
        fallbackSubtitle="Type what you want. The agent segments the warehouse, drafts bilingual offer copy, splits a 10% holdout, and projects the causal lift."
        polish
      />

      {/* Command bar */}
      <section
        aria-labelledby="command-heading"
        className="rounded-2xl border border-border bg-surface p-5 shadow-tile"
      >
        <h2 id="command-heading" className="pb-2 font-display text-lg font-semibold">
          What should we save?
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={3}
            placeholder={DEFAULT_COMMAND}
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground shadow-tile placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9C349]"
            aria-label="Save-loop command"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setCommand(q)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-medium transition',
                  command === q
                    ? 'border-[#F9C349] bg-[#FDF5E0] text-foreground'
                    : 'border-border bg-white text-muted-foreground hover:border-[#F9C349] hover:text-foreground',
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              Grounded in warehouse · Claude CLI parses + drafts · 10% holdout
            </p>
            <Button type="submit" disabled={isRunning || !command.trim()} className="gap-2">
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Agent running…' : 'Run agent'}
            </Button>
          </div>
        </form>
      </section>

      {/* Loading / error / empty */}
      {isRunning ? (
        <NexusLoader
          label="Agent segmenting + drafting…"
          sublabel="parse → SQL → copy → holdout → lift"
          height={200}
        />
      ) : runLoop.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
          Save-loop failed. Retry — warehouse or CLI may be warming up.
        </div>
      ) : data ? (
        <ResultView
          data={data}
          expandedTrace={expandedTrace}
          onToggleTrace={(i) =>
            setExpandedTrace((prev) => ({ ...prev, [i]: !prev[i] }))
          }
        />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          Pick a quick-pick above or type your own command, then run the agent.
        </p>
      )}
    </div>
  );
}

function ResultView({
  data,
  expandedTrace,
  onToggleTrace,
}: {
  data: SaveLoopResponse;
  expandedTrace: Record<number, boolean>;
  onToggleTrace: (i: number) => void;
}) {
  const holdoutData = useMemo(
    () => [
      { name: 'Treated', value: data.plan.treated_count, fill: '#F9C349' },
      { name: 'Holdout', value: data.plan.holdout_count, fill: '#4B4F73' },
    ],
    [data.plan.treated_count, data.plan.holdout_count],
  );

  return (
    <div className="space-y-6">
      {data.abstained ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Agent abstained — segment too small for a reliable lift estimate. Widen the command.
        </div>
      ) : null}

      <StepCard stepNumber={1} title="Targeting" accent="Segment SQL + member count">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Members matched" value={data.segment.member_count.toLocaleString()} />
          <Stat
            label="Avg 90-day spend"
            value={formatAED(data.segment.avg_spend_aed)}
            caption="per member"
          />
          <Stat label="Bonus budget" value={formatAED(data.offer.bonus_aed)} caption="per member" />
        </div>
        <details className="mt-3 rounded-lg border border-border bg-[#FDFCF8] p-3 text-xs">
          <summary className="cursor-pointer select-none font-mono text-[11px] font-semibold text-muted-foreground">
            Segment SQL · {data.segment.sql.length} chars
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-[#0F1120] p-3 font-mono text-[11px] leading-relaxed text-[#F9C349]">
            <code>{data.segment.sql}</code>
          </pre>
        </details>
      </StepCard>

      <StepCard stepNumber={2} title="Creative" accent="EN + AR offer copy">
        <div className="grid gap-3 md:grid-cols-2">
          <CopyCard dir="ltr" lang="English" content={data.offer.en} />
          <CopyCard dir="rtl" lang="العربية" content={data.offer.ar} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">
            channel · {data.offer.channel}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            bonus · {formatAED(data.offer.bonus_aed)}
          </Badge>
        </div>
      </StepCard>

      <StepCard stepNumber={3} title="Holdout split" accent="10% randomised control">
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-border bg-white p-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={holdoutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {holdoutData.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number | string) => [Number(v).toLocaleString(), 'Members']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Treatment arm"
              value={data.plan.treated_count.toLocaleString()}
              caption="90% · receives offer"
            />
            <Stat
              label="Holdout arm"
              value={data.plan.holdout_count.toLocaleString()}
              caption="10% · control"
            />
          </div>
        </div>
      </StepCard>

      <StepCard stepNumber={4} title="Expected lift" accent="14-day causal projection">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat
            label="Expected lift (AED)"
            value={formatAEDCompact(data.plan.expected_lift_aed)}
            caption="incremental vs holdout"
          />
          <Stat
            label="Expected lift (%)"
            value={`+${data.plan.expected_lift_pct.toFixed(1)}%`}
            caption="avg basket uplift"
          />
          <div className="rounded-lg border border-border bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Confidence
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={CONFIDENCE_TONE[data.plan.confidence]}>
                {data.plan.confidence}
              </Badge>
              {data.plan.confidence === 'low' ? (
                <span className="text-[11px] text-muted-foreground">sample too small</span>
              ) : null}
            </div>
          </div>
        </div>
      </StepCard>

      {/* Trace timeline */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-tile">
        <h3 className="pb-3 font-display text-base font-semibold">Trace · agent tool calls</h3>
        <ol className="space-y-2">
          {data.trace.map((step, i) => {
            const expanded = !!expandedTrace[i];
            return (
              <li key={`${step.step}-${i}`} className="rounded-lg border border-border bg-white">
                <button
                  type="button"
                  onClick={() => onToggleTrace(i)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs"
                  aria-expanded={expanded}
                >
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform', expanded ? '' : '-rotate-90')}
                  />
                  <span className="w-8 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[11px] text-foreground">{step.step}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {step.tool}
                  </Badge>
                </button>
                {expanded ? (
                  <pre className="overflow-x-auto border-t border-border bg-[#FDFCF8] px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {step.output}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function StepCard({
  stepNumber,
  title,
  accent,
  children,
}: {
  stepNumber: number;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  const icons: Record<number, typeof Users> = {
    1: Users,
    2: MessageSquare,
    3: Target,
    4: Activity,
  };
  const Icon = icons[stepNumber] ?? FileText;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-tile">
      <header className="flex items-center gap-2 pb-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F9C349] text-[11px] font-semibold text-[#0F1120] ring-1 ring-[#DA9712]">
          {stepNumber}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {accent ? (
          <span className="ml-2 text-[11px] text-muted-foreground">· {accent}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-[18px] font-semibold leading-none tabular-nums">
        {value}
      </p>
      {caption ? <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function CopyCard({ dir, lang, content }: { dir: 'ltr' | 'rtl'; lang: string; content: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[#F9C349]/40 bg-[#FDF5E0] p-4',
        dir === 'rtl' ? 'text-right' : 'text-left',
      )}
      dir={dir}
    >
      <p className="pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
        {lang}
      </p>
      <p className="whitespace-pre-wrap font-display text-sm leading-relaxed text-foreground">
        {content}
      </p>
    </div>
  );
}
