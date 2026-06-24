'use client';

import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEVALUATION_DEMO } from '@/lib/demo-data';
import { formatInt, formatPct } from '@/lib/format';

const { event, redemptionVelocity, appDau7dRollingPct, complaintVolume } = DEVALUATION_DEMO;

/**
 * Dec-2024 devaluation recovery tracker — three curves on one dateline.
 * Redemption velocity spike → collapse → recovery. App DAU drop → slow climb. Complaint surge → normalise.
 * The shaded band marks the devaluation event; recovery is anything returning to pre-event baseline.
 */
export function DevaluationCard() {
  const merged = redemptionVelocity.map((r, i) => ({
    month: r.month,
    burn: r.nexus_burned_m,
    dau: (appDau7dRollingPct[i]?.pct ?? 0) * 100,
    tickets: complaintVolume[i]?.tickets ?? 0,
  }));

  const ZERO = { month: '—', burn: 0, dau: 0, tickets: 0 };
  const preEvent = merged.find((m) => m.month === '2024-11') ?? merged[0] ?? ZERO;
  const postEventLatest = merged[merged.length - 1] ?? preEvent;
  const preBurn = preEvent.burn || 1e-6;
  const preDau = preEvent.dau || 1e-6;
  const preTickets = preEvent.tickets || 1e-6;

  const dauRecovery = postEventLatest.dau >= preDau * 0.95;
  const ticketRecovery = postEventLatest.tickets <= preTickets * 1.05;
  const burnStable = Math.abs(postEventLatest.burn - preEvent.burn) / preBurn <= 0.15;

  const allRecovered = dauRecovery && ticketRecovery && burnStable;

  return (
    <Card className="border-l-4 border-l-[#DA9712]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#DA9712]" />
          Post-devaluation recovery — {event.date}
          <Badge variant={allRecovered ? 'success' : 'warning'} className="ml-auto">
            {allRecovered ? 'RECOVERED' : 'RECOVERING'}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{event.description}.</span> Three curves show how members responded: panic-burn, app disengagement, complaint surge. Recovery = return to pre-event baseline (shaded line).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat trio */}
        <div className="grid gap-2 md:grid-cols-3">
          <MiniStat
            label="Monthly Nexus burn (M)"
            pre={preEvent.burn}
            post={postEventLatest.burn}
            unit=" M"
            ok={burnStable}
          />
          <MiniStat
            label="App DAU — 7-day rolling"
            pre={preEvent.dau}
            post={postEventLatest.dau}
            unit="%"
            ok={dauRecovery}
          />
          <MiniStat
            label="Complaint tickets / mo"
            pre={preEvent.tickets}
            post={postEventLatest.tickets}
            unit=""
            ok={ticketRecovery}
            inverted
          />
        </div>

        {/* Combined curves */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DC" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={42} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={42} />
              <ReTooltip />
              <ReferenceLine x="2024-12" stroke="#DC2626" strokeDasharray="3 3" label={{ value: 'Devaluation', position: 'top', fontSize: 10, fill: '#DC2626' }} yAxisId="left" />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="burn"
                name="Nexus burn (M)"
                stroke="#DA9712"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="dau"
                name="App DAU (%)"
                stroke="#0F1120"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="tickets"
                name="Complaints (tickets)"
                stroke="#DC2626"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
          <span className="font-semibold">Reading the chart:</span> Dec-2024 Nexus burn spiked{' '}
          <span className="font-semibold">1.9×</span> (panic redemption before ratio change), app DAU dropped{' '}
          <span className="font-semibold">–14 pp</span>, complaints surged{' '}
          <span className="font-semibold">2.6×</span>. 14 months in, burn is above pre-event baseline, DAU has recovered, complaints have normalised. The trauma is mostly priced out — but trust rebuild is never finished.
        </p>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  pre,
  post,
  unit,
  ok,
  inverted,
}: {
  label: string;
  pre: number;
  post: number;
  unit: string;
  ok: boolean;
  inverted?: boolean;
}) {
  const delta = post - pre;
  const deltaPct = (delta / Math.max(Math.abs(pre), 1)) * 100;
  const Arrow = delta >= 0 ? TrendingUp : TrendingDown;
  const colour =
    ok ? 'text-emerald-600' : 'text-amber-600';
  // inverted: for complaints, "down" = good
  const shownValue = unit === '%' ? formatPct(post, 1) : unit === ' M' ? `${post.toFixed(1)} M` : formatInt(post);
  const preShown = unit === '%' ? formatPct(pre, 1) : unit === ' M' ? `${pre.toFixed(1)} M` : formatInt(pre);

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums">{shownValue}</span>
        <span className={`flex items-center gap-0.5 text-xs font-medium ${colour}`}>
          <Arrow className="h-3 w-3" aria-hidden />
          {deltaPct > 0 ? '+' : ''}
          {deltaPct.toFixed(1)}%
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Pre-event: {preShown} · {inverted ? (ok ? 'normalised' : 'still elevated') : ok ? 'recovered' : 'still gapped'}</p>
    </div>
  );
}
