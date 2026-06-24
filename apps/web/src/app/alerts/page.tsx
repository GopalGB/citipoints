'use client';

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { PageAiSummary } from '@/components/insights/page-ai-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { AI_ALERTS_DEMO, type AiAlert } from '@/lib/demo-data';
import { cn } from '@/lib/utils';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const SEV_STYLES: Record<AiAlert['severity'], { chip: string; border: string; label: string }> = {
  critical: { chip: 'bg-rose-100 text-rose-800', border: 'border-l-rose-500', label: 'CRITICAL' },
  warning: { chip: 'bg-amber-100 text-amber-800', border: 'border-l-amber-500', label: 'WARNING' },
  opportunity: { chip: 'bg-emerald-100 text-emerald-800', border: 'border-l-emerald-500', label: 'OPPORTUNITY' },
  info: { chip: 'bg-sky-100 text-sky-800', border: 'border-l-sky-500', label: 'INFO' },
};

export default function AlertsPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:alerts', 'all');
  const [acked, setAcked] = useState<Set<string>>(
    () => new Set(AI_ALERTS_DEMO.filter((a) => a.acknowledged).map((a) => a.id)),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => AI_ALERTS_DEMO.filter((a) => !dismissed.has(a.id)),
    [dismissed],
  );

  const counts = useMemo(() => {
    return AI_ALERTS_DEMO.reduce(
      (acc, a) => {
        if (dismissed.has(a.id)) return acc;
        acc[a.severity] += 1;
        acc.total += 1;
        if (!acked.has(a.id)) acc.unacked += 1;
        return acc;
      },
      { critical: 0, warning: 0, opportunity: 0, info: 0, total: 0, unacked: 0 },
    );
  }, [acked, dismissed]);

  const toggleAck = (id: string) => {
    const next = new Set(acked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcked(next);
  };

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
  };

  const postToSlack = (alert: AiAlert) => {
    // Stub — in production this hits a Slack webhook
    if (typeof window === 'undefined') return;
    const txt = `[${SEV_STYLES[alert.severity].label}] ${alert.title}\n\n${alert.narrative}\n\nEvidence: ${alert.evidence}${alert.action ? `\nAction: ${alert.action}` : ''}`;
    navigator.clipboard?.writeText(txt);
    alert.acknowledged = true;
    setAcked((prev) => new Set(prev).add(alert.id));
    // eslint-disable-next-line no-alert
    window.alert('Alert copied to clipboard — paste into #nexus-ops. (Slack webhook wiring is stubbed.)');
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
            {dataAnchor && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Anchored to <span className="font-mono text-foreground">{dataAnchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <DynamicBanner
        page="alerts"
        filters={windowFilters}
        kicker="Alerts · Proactive AI feed"
        fallbackHeadline="What needs attention this window?"
        fallbackSubtitle="Proactive AI feed — anomalies, breakage spikes, model drift, POS heartbeat misses and seasonality warnings are pushed here with a plain-English narrative, evidence citation, and a one-click action."
        variant="light"
        polish
      />

      <PageAiSummary
        queryKey={['alerts-insights']}
        loader={() => api.insightsHome(windowFilters)}
        pageTitle="Alerts"
        emailStats={{
          Total: `${counts.total}`,
          Unacked: `${counts.unacked}`,
          Critical: `${counts.critical}`,
          Warning: `${counts.warning}`,
          Opportunity: `${counts.opportunity}`,
        }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <Bell className="h-3.5 w-3.5" /> Proactive AI alerts
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {counts.unacked} unread · {counts.critical} critical · {counts.opportunity} opportunity
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            The dashboard pushes instead of waits to be pulled. Every alert carries a plain-English narrative, evidence citation, and a one-click action. Acknowledge, dismiss, or post to ops channel.
          </p>
        </div>
      </section>

      {/* Filter chips (counts) */}
      <div className="flex flex-wrap gap-2">
        {(['critical', 'warning', 'opportunity', 'info'] as AiAlert['severity'][]).map((sev) => (
          <Badge key={sev} className={SEV_STYLES[sev].chip}>
            {SEV_STYLES[sev].label}: {counts[sev]}
          </Badge>
        ))}
        <Badge variant="outline" className="ml-auto">
          Auto-refresh: every 5 min (stub)
        </Badge>
      </div>

      {/* Feed */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Inbox zero. The warehouse is behaving.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const isAcked = acked.has(a.id);
            const s = SEV_STYLES[a.severity];
            return (
              <li key={a.id}>
                <Card className={cn('border-l-4', s.border, isAcked && 'opacity-70')}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className={s.chip}>{s.label}</Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                        <span className="text-xs text-muted-foreground">{formatAgo(a.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => postToSlack(a)}>
                          <Send className="h-3.5 w-3.5" />
                          Post to ops
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={isAcked ? 'default' : 'outline'}
                          onClick={() => toggleAck(a.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isAcked ? 'Acknowledged' : 'Acknowledge'}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Dismiss alert"
                          onClick={() => dismiss(a.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="mt-2 text-base leading-snug">{a.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 text-sm">
                    <p className="leading-relaxed text-foreground">{a.narrative}</p>
                    <p className="rounded-md bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Evidence: </span>
                      {a.evidence}
                    </p>
                    {a.action ? (
                      <p className="rounded-md border border-[#F9C349]/40 bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
                        <Sparkles className="mr-1 inline h-3 w-3" />
                        <span className="font-semibold">Suggested action:</span> {a.action}
                      </p>
                    ) : null}
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Source: {a.source}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        Alerts are generated by the anomaly engine (STL), breakage monitor, model-retrain hooks, seasonality forecaster, POS heartbeat, and the app-health watcher. Add a source by wiring it in <code className="font-mono">/api/v1/alerts/emit</code>.
      </div>
    </div>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) {
    const mins = Math.floor(diff / 60_000);
    return `${mins}m ago`;
  }
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
