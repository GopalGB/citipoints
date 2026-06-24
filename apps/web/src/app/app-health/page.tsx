'use client';

import {
  Activity,
  AlertOctagon,
  HeartPulse,
  KeyRound,
  LifeBuoy,
  Smartphone,
  Star,
  TrendingDown,
} from 'lucide-react';
import { ResponsiveContainer, Line, Tooltip as ReTooltip, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { APP_HEALTH_DEMO } from '@/lib/demo-data';
import { formatInt, formatPct } from '@/lib/format';

const {
  crashFreeRate,
  crashFreeTarget,
  otpDeliverySuccess,
  otpDeliveryTarget,
  appRatingIos,
  appRatingAndroid,
  appRatingTrend,
  activeIncidents,
  p0Tickets24h,
  p1Tickets24h,
  p2Tickets7d,
  mttrHours,
  ticketBacklog,
  ticketBacklogTrend,
  reopenRate,
  topComplaints,
  posOutages7d,
  posUptime,
} = APP_HEALTH_DEMO;

export default function AppHealthPage() {
  const crashTone = crashFreeRate >= crashFreeTarget ? 'success' : 'warning';
  const otpTone = otpDeliverySuccess >= otpDeliveryTarget ? 'success' : 'warning';
  const ratingTone = appRatingIos >= 4 ? 'success' : appRatingIos >= 3.5 ? 'warning' : 'danger';
  const posTone = posUptime >= 0.999 ? 'success' : 'warning';

  const avgRating = (appRatingIos + appRatingAndroid) / 2;
  const ratingFirst = appRatingTrend[0] ?? 0;
  const ratingLast = appRatingTrend[appRatingTrend.length - 1] ?? ratingFirst;
  const ratingDropPct = ratingFirst > 0 ? ((ratingFirst - ratingLast) / ratingFirst) * 100 : 0;

  return (
    <div className="animate-fade-up space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <HeartPulse className="h-3.5 w-3.5" /> App health · Support · Ops
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {formatPct(crashFreeRate * 100, 1)} crash-free · {avgRating.toFixed(1)}★ avg rating · {activeIncidents} active incident
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            The operator lens: Nexus mobile app health, OTP delivery, store-rating trend, ticket backlog, POS outages. Covers the three silent Nexus pains most dashboards ignore — chronic crashes, support backlog, and POS reliability.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={ratingTone === 'success' ? 'success' : ratingTone === 'warning' ? 'warning' : 'danger'}>
              Rating dropped {ratingDropPct.toFixed(1)}% over 7 weeks
            </Badge>
            <Badge variant="outline" className="text-white/90">
              MTTR {mttrHours}h · reopen {formatPct(reopenRate * 100, 0)}
            </Badge>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthKpi
          icon={Smartphone}
          label="Crash-free sessions"
          value={formatPct(crashFreeRate * 100, 2)}
          sub={`Target ${formatPct(crashFreeTarget * 100, 1)} · gap ${formatPct((crashFreeTarget - crashFreeRate) * 100, 1)}`}
          tone={crashTone}
        />
        <HealthKpi
          icon={KeyRound}
          label="OTP delivery success"
          value={formatPct(otpDeliverySuccess * 100, 1)}
          sub={`Target ${formatPct(otpDeliveryTarget * 100, 0)} · Twilio ME region`}
          tone={otpTone}
        />
        <HealthKpi
          icon={Star}
          label="App rating (iOS / Android)"
          value={`${appRatingIos.toFixed(1)} / ${appRatingAndroid.toFixed(1)}`}
          sub={`Down from 3.8 / 3.9 · 7-week trend`}
          tone={ratingTone}
        />
        <HealthKpi
          icon={Activity}
          label="POS uptime — last 7 d"
          value={formatPct(posUptime * 100, 2)}
          sub={`${posOutages7d} outages · store-weighted`}
          tone={posTone}
        />
      </section>

      {/* Secondary tiles — tickets */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthKpi
          icon={AlertOctagon}
          label="P0 tickets (24h)"
          value={`${p0Tickets24h}`}
          sub="Target zero"
          tone={p0Tickets24h === 0 ? 'success' : 'danger'}
        />
        <HealthKpi
          icon={AlertOctagon}
          label="P1 tickets (24h)"
          value={`${p1Tickets24h}`}
          sub="Target <5"
          tone={p1Tickets24h < 5 ? 'success' : 'warning'}
        />
        <HealthKpi
          icon={LifeBuoy}
          label="Support backlog"
          value={formatInt(ticketBacklog)}
          sub={`MTTR ${mttrHours}h · reopen ${formatPct(reopenRate * 100, 0)}`}
          tone="warning"
        />
        <HealthKpi
          icon={TrendingDown}
          label="P2 tickets (7d)"
          value={`${p2Tickets7d}`}
          sub="Feature + minor-bug reports"
          tone="primary"
        />
      </section>

      {/* Trend charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>App rating — 7-week trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              iOS + Android blended. Continuous drift downward aligns with Nexus pain #2 (chronic app crashes post-v4.2 release).
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={appRatingTrend.map((r, i) => ({ week: `W-${appRatingTrend.length - i}`, rating: r }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis domain={[2.5, 4.5]} tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Line
                    type="monotone"
                    dataKey="rating"
                    stroke="#DA9712"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#F9C349' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <span className="font-semibold">Alert:</span> Rating dropped {ratingDropPct.toFixed(1)}% over 7 weeks. Stripe-payment crash in v4.2 is the top root cause (48% of crash signatures).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support ticket backlog — 7-day trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Backlog rose 42% in 6 weeks before the backlog-burndown sprint last week. Now plateauing.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ticketBacklogTrend.map((n, i) => ({ day: `D-${ticketBacklogTrend.length - i}`, tickets: n }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Line
                    type="monotone"
                    dataKey="tickets"
                    stroke="#0F1120"
                    strokeWidth={3}
                    dot={{ r: 3, fill: '#F9C349' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top complaints */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 member complaints — last 30 days</CardTitle>
          <p className="text-sm text-muted-foreground">
            Ranked by ticket volume. Bold rows need product/engineering attention, not support training.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead>Bar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topComplaints.map((c, i) => (
                <TableRow key={c.reason}>
                  <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.reason}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPct(c.share * 100, 0)}</TableCell>
                  <TableCell>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-[#DA9712]"
                        style={{ width: `${c.share * 100 * 3}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'primary';

const TONE_CLS: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50/60',
  warning: 'border-amber-200 bg-amber-50/60',
  danger: 'border-rose-200 bg-rose-50/60',
  primary: 'border-[#F9C349]/30 bg-[#FDF5E0]/60',
};

function HealthKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof HeartPulse;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  return (
    <Card className={TONE_CLS[tone]}>
      <CardContent className="flex flex-col gap-1 pt-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground/60" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <span className="font-display text-[26px] font-semibold leading-none tabular-nums">
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}
