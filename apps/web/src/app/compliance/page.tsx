'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Globe,
  Languages,
  MapPin,
  Moon,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PDPL_DEMO } from '@/lib/demo-data';
import { formatPct } from '@/lib/format';

const DsrAssistantModal = dynamic(
  () => import('@/components/compliance/dsr-assistant-modal').then((m) => m.DsrAssistantModal),
  { ssr: false },
);

const { enforcementDate, daysUntilEnforcement, consentRate, consentRateDelta, dsrQueue, breachLog, residency, dpiaCoverage, subprocessors } = PDPL_DEMO;

export default function CompliancePage() {
  const [dsrOpen, setDsrOpen] = useState(false);
  const consentTrendTone =
    consentRate >= 0.95 ? 'success' : consentRate >= 0.90 ? 'warning' : 'danger';

  const countdownTone =
    daysUntilEnforcement <= 90 ? 'danger' : daysUntilEnforcement <= 180 ? 'warning' : 'primary';

  return (
    <div className="animate-fade-up space-y-6">
      {/* Sovereign-cloud pitch hero — NEW (2026-04-19) */}
      <SovereignCloudHero />

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <ShieldCheck className="h-3.5 w-3.5" /> PDPL Compliance · UAE Data Protection Law
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {daysUntilEnforcement} days to PDPL enforcement — {formatPct(consentRate * 100, 1)} consent coverage
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            UAE Federal Decree-Law No. 45 of 2021 enforcement starts {enforcementDate}. Tracks consent, Data Subject Requests (DSR), breach log, sub-processor register, and DPIA coverage. Single-pane PDPL audit artefact for Nexus + coalition partners.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F9C349] px-3 py-1 text-xs font-semibold text-[#0F1120]">
              <Timer className="h-3.5 w-3.5" /> Enforces {enforcementDate}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
              {subprocessors.length} sub-processors · {residency.length} residency zones
            </span>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ComplianceKpi
          icon={Timer}
          label="Enforcement countdown"
          value={`${daysUntilEnforcement} days`}
          tone={countdownTone}
          sub={`Effective ${enforcementDate}`}
        />
        <ComplianceKpi
          icon={Users}
          label="Active PDPL consent"
          value={formatPct(consentRate * 100, 1)}
          tone={consentTrendTone}
          sub={`${consentRateDelta > 0 ? '+' : ''}${formatPct(consentRateDelta * 100, 1)} MoM`}
        />
        <ComplianceKpi
          icon={FileCheck}
          label="DSR queue (open)"
          value={`${dsrQueue.open}`}
          tone={dsrQueue.sla_at_risk > 0 ? 'warning' : 'success'}
          sub={`${dsrQueue.sla_at_risk} at SLA risk · avg close ${dsrQueue.avg_close_hours}h`}
        />
        <ComplianceKpi
          icon={ShieldCheck}
          label="DPIA coverage"
          value={formatPct(dpiaCoverage * 100, 0)}
          tone={dpiaCoverage >= 0.9 ? 'success' : dpiaCoverage >= 0.75 ? 'warning' : 'danger'}
          sub="Processing activities with DPIA"
        />
      </section>

      {/* DSR + Breach side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Data Subject Requests — last 30 days
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setDsrOpen(true)}
              >
                <Sparkles className="h-3 w-3" />
                Draft DSR response
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Open', value: dsrQueue.open, tone: 'warning' as const },
                { label: 'In progress', value: dsrQueue.in_progress, tone: 'primary' as const },
                { label: 'Closed 30d', value: dsrQueue.closed_30d, tone: 'success' as const },
                { label: 'SLA risk', value: dsrQueue.sla_at_risk, tone: dsrQueue.sla_at_risk > 0 ? ('danger' as const) : ('success' as const) },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {cell.label}
                  </p>
                  <p className="font-display text-2xl font-semibold tabular-nums">{cell.value}</p>
                  <Badge variant={cell.tone} className="mt-1 text-[9px]">
                    {cell.tone.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
              <span className="font-semibold">Target SLA:</span> 30 days per PDPL Art. 13.
              Current average: <span className="font-semibold">{dsrQueue.avg_close_hours}h</span>
              {' '}(well inside).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Breach register — rolling 12 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(breachLog as readonly unknown[]).length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                No reportable breaches in the last 12 months.
              </div>
            ) : (
              <ul className="space-y-2">
                {breachLog.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          b.severity === 'Low'
                            ? 'success'
                            : b.severity === 'Medium'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {b.severity}
                      </Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">{b.id}</span>
                      <span className="text-xs text-muted-foreground">· {b.date}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {b.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground">{b.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Residency + sub-processors */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Data residency map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Host</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {residency.map((r) => (
                  <TableRow key={r.region}>
                    <TableCell className="font-medium">{r.region}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.records}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.host}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              All primary data residency in UAE (AWS me-central-1). Bahrain replica uses AWS me-south-1. No cross-border data transfer outside GCC.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Sub-processor register
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>DPA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subprocessors.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.jurisdiction}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.dpa}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Readiness checklist */}
      <Card>
        <CardHeader>
          <CardTitle>PDPL readiness checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2">
            {[
              { ok: true, item: 'Lawful basis recorded for every processing activity' },
              { ok: true, item: 'DSR workflow live (access · rectification · erasure · portability)' },
              { ok: true, item: 'Breach notification runbook · 72-hour SLA' },
              { ok: true, item: 'Data residency primary in UAE (AWS me-central-1)' },
              { ok: true, item: 'DPO appointed (internal: Legal Counsel)' },
              { ok: false, item: 'Age-gate for member 13-17 consent parental confirmation' },
              { ok: false, item: 'Automated DSR self-service portal (currently email-triggered)' },
              { ok: true, item: 'Standard Contractual Clauses with sub-processors' },
            ].map((row) => (
              <li
                key={row.item}
                className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
              >
                {row.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                )}
                <span className={row.ok ? 'text-foreground' : 'text-foreground/80'}>{row.item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">2 gaps remain.</span> Both trackable in the roadmap for
            Q3 2026 — well before {enforcementDate} enforcement. See{' '}
            <Link href="/executive" className="underline">Executive deck</Link> for board escalation
            sequence.
          </p>
        </CardContent>
      </Card>

      <DataResidencyMap />

      <DsrAssistantModal open={dsrOpen} onClose={() => setDsrOpen(false)} />
    </div>
  );
}

// ── Sovereign-Cloud Hero (NEW 2026-04-19) ──────────────────────────────
// Pitch-grade UAE sovereign-cloud block — Core42 SFCSI, PDPL residency,
// SOC 2 Type II, Jais Arabic LLM, Ramadan regressors.

const SOVEREIGN_BLOCKS: Array<{
  icon: typeof Shield;
  title: string;
  body: string;
}> = [
  {
    icon: Shield,
    title: 'Core42 SFCSI',
    body: 'Deploys on Sovereign Financial Cloud Services Infrastructure, launched by CBUAE + Core42 on 25 Feb 2026.',
  },
  {
    icon: MapPin,
    title: 'PDPL Residency',
    body: 'All member PII resident in Abu Dhabi. Federal Decree-Law 45/2021 compliant.',
  },
  {
    icon: CheckCircle2,
    title: 'SOC 2 Type II',
    body: 'Evidence collection in progress via Vanta. Target: 6 months from deploy.',
  },
  {
    icon: Languages,
    title: 'Jais Arabic LLM',
    body: 'G42-aligned Arabic LLM available for all Arabic generation workloads.',
  },
  {
    icon: Moon,
    title: 'Ramadan Regressors',
    body: 'Every seasonal model ships with Hijri-calendar regressors.',
  },
];

function SovereignCloudHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border-2 border-[#F9C349] bg-nexus-navy p-6 text-white shadow-pop md:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#F9C349] bg-[#F9C349]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F9C349]">
          <Shield className="h-3.5 w-3.5" /> UAE Sovereign-Cloud Ready
        </span>
        <span className="text-[11px] text-white/70">
          Abu Dhabi residency · Jais Arabic LLM · Hijri-calendar seasonality
        </span>
      </div>
      <h2 className="mt-4 max-w-3xl font-display text-xl font-semibold text-white md:text-[22px]">
        Built for CBUAE sandboxes and Mubadala-portfolio deployments from day zero.
      </h2>
      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {SOVEREIGN_BLOCKS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-[#F9C349]/40 hover:bg-white/[0.08]"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-[#F9C349]" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#F9C349]">
                {title}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/80">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Data Residency Map (NEW 2026-04-19) ────────────────────────────────
// Styled SVG callouts for the three residency zones. No live geo — the
// pitch only needs the pin geometry + labels.

interface ResidencyPin {
  id: string;
  label: string;
  sub: string;
  cx: number;
  cy: number;
  primary?: boolean;
}

const RESIDENCY_PINS: ResidencyPin[] = [
  { id: 'auh', label: 'Core42 Abu Dhabi', sub: 'Sovereign SFCSI · primary', cx: 320, cy: 180, primary: true },
  { id: 'dxb', label: 'AWS me-central-1 (Dubai)', sub: 'Active · all writes', cx: 350, cy: 150, primary: true },
  { id: 'bah', label: 'AWS me-south-1 (Bahrain)', sub: 'Read replica · DR', cx: 180, cy: 120 },
];

function DataResidencyMap() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Data Residency Map
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Primary in UAE. Bahrain kept warm for DR. No data egress beyond GCC.
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#0F1120] via-[#141834] to-[#1A1D33]">
          <svg viewBox="0 0 520 280" className="block h-auto w-full">
            {/* Stylised GCC coastline — 3 geometric shapes, no live map. */}
            <path
              d="M 80 60 Q 140 40 220 80 Q 310 110 360 90 Q 420 75 480 130 Q 470 210 380 230 Q 280 245 200 215 Q 120 195 80 160 Z"
              fill="#1B1F3A"
              stroke="#2A3050"
              strokeWidth={1.5}
              opacity={0.85}
            />
            {/* Latitude lines */}
            <line x1={30} y1={120} x2={490} y2={120} stroke="#F9C349" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.3} />
            <line x1={30} y1={180} x2={490} y2={180} stroke="#F9C349" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.3} />
            {/* Pins */}
            {RESIDENCY_PINS.map((pin) => (
              <g key={pin.id}>
                <circle
                  cx={pin.cx}
                  cy={pin.cy}
                  r={14}
                  fill={pin.primary ? '#F9C349' : '#94a3b8'}
                  fillOpacity={0.25}
                />
                <circle
                  cx={pin.cx}
                  cy={pin.cy}
                  r={6}
                  fill={pin.primary ? '#F9C349' : '#CBD5E1'}
                  stroke="#0F1120"
                  strokeWidth={1.5}
                />
                <g transform={`translate(${pin.cx + 12}, ${pin.cy - 8})`}>
                  <rect
                    x={0}
                    y={0}
                    width={190}
                    height={38}
                    rx={4}
                    fill="#0F1120"
                    stroke={pin.primary ? '#F9C349' : '#475569'}
                    strokeWidth={1}
                    opacity={0.94}
                  />
                  <text x={8} y={16} fontSize={11} fontWeight={700} fill={pin.primary ? '#F9C349' : '#E2E8F0'}>
                    {pin.label}
                  </text>
                  <text x={8} y={30} fontSize={9.5} fill="#94A3B8">
                    {pin.sub}
                  </text>
                </g>
              </g>
            ))}
            {/* Legend */}
            <g transform="translate(30, 250)">
              <circle cx={6} cy={0} r={5} fill="#F9C349" />
              <text x={16} y={4} fontSize={10} fill="#E2E8F0" fontWeight={600}>
                Primary (active writes)
              </text>
              <circle cx={180} cy={0} r={5} fill="#CBD5E1" />
              <text x={190} y={4} fontSize={10} fill="#E2E8F0" fontWeight={600}>
                Read replica / DR
              </text>
            </g>
          </svg>
        </div>
        <p className="mt-3 rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
          <span className="font-semibold">Sovereignty guarantee:</span> no member PII leaves the GCC.
          Cross-border analytic extracts anonymised and k-anonymity ≥ 5 before export.
        </p>
      </CardContent>
    </Card>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'primary';

const TONE_CLS: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50/60',
  warning: 'border-amber-200 bg-amber-50/60',
  danger: 'border-rose-200 bg-rose-50/60',
  primary: 'border-[#F9C349]/30 bg-[#FDF5E0]/60',
};

function ComplianceKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Timer;
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
