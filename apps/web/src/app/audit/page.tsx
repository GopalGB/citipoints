'use client';

import { CheckCircle2, Download, FileText, Filter, ShieldAlert, XOctagon } from 'lucide-react';
import { useMemo, useState } from 'react';

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
import { AUDIT_LOG_DEMO, type AuditEntry } from '@/lib/demo-data';

const OUTCOME_ICON: Record<AuditEntry['outcome'], { icon: typeof CheckCircle2; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-600' },
  denied: { icon: ShieldAlert, cls: 'text-amber-600' },
  error: { icon: XOctagon, cls: 'text-rose-600' },
};

export default function AuditPage() {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<AuditEntry['outcome'] | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AUDIT_LOG_DEMO.filter((e) => {
      if (outcome !== 'all' && e.outcome !== outcome) return false;
      if (!q) return true;
      const hay = `${e.actor} ${e.action} ${e.resource} ${e.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, outcome]);

  const counts = useMemo(
    () => ({
      ok: AUDIT_LOG_DEMO.filter((e) => e.outcome === 'ok').length,
      denied: AUDIT_LOG_DEMO.filter((e) => e.outcome === 'denied').length,
      error: AUDIT_LOG_DEMO.filter((e) => e.outcome === 'error').length,
      actors: new Set(AUDIT_LOG_DEMO.map((e) => e.actor)).size,
    }),
    [],
  );

  const exportCsv = () => {
    const header = ['id', 'ts', 'actor', 'action', 'resource', 'outcome', 'ip'];
    const rows = filtered.map((e) => [e.id, e.ts, e.actor, e.action, `"${e.resource.replace(/"/g, '""')}"`, e.outcome, e.ip ?? '']);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    if (typeof window === 'undefined') return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="animate-fade-up space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <FileText className="h-3.5 w-3.5" /> Audit log · PDPL Art. 13 evidence
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {AUDIT_LOG_DEMO.length} events · {counts.actors} actors · {counts.denied} denied · {counts.error} errors
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            Every view, export, chat query, model retrain, DSR close, and denied API access logged. 90-day hot retention, 7-year cold retention for PDPL compliance. CSV export ready for external auditors.
          </p>
        </div>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-tile">
        <input
          aria-label="Search audit log"
          placeholder="Filter by actor, action, resource…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 min-w-[260px] flex-1 rounded-md border border-border bg-white px-3 text-sm focus:border-[#F9C349] focus:outline-none"
        />

        <div role="radiogroup" aria-label="Outcome filter" className="inline-flex overflow-hidden rounded-md border border-border">
          {(['all', 'ok', 'denied', 'error'] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={outcome === o}
              onClick={() => setOutcome(o)}
              className={
                'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ' +
                (outcome === o ? 'bg-[#F9C349] text-[#0F1120]' : 'bg-white text-muted-foreground hover:bg-muted')
              }
            >
              {o}
            </button>
          ))}
        </div>

        <Button type="button" size="sm" variant="outline" onClick={exportCsv} className="ml-auto">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-[#DA9712]" />
            Events — {filtered.length}
            {filtered.length !== AUDIT_LOG_DEMO.length ? (
              <Badge variant="outline" className="ml-1 text-[10px]">
                filtered
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const { icon: Icon, cls } = OUTCOME_ICON[e.outcome];
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {new Date(e.ts).toLocaleString('en-GB', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{e.actor}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={e.resource}>
                      {e.resource}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 ${cls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase">{e.outcome}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {e.ip ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Retention: 90-day hot · 7-year cold (PDPL Art. 13 + UAE Federal audit requirements). Source pipeline:{' '}
        <code className="font-mono">audit_events_daily</code> · append-only.
      </p>
    </div>
  );
}
