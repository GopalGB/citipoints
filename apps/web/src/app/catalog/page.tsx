'use client';

import { BookOpen, Database, Link2, Search, User } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { METRIC_CATALOG } from '@/lib/demo-data';

export default function CatalogPage() {
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

  const owners = useMemo(() => Array.from(new Set(METRIC_CATALOG.map((m) => m.owner))), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return METRIC_CATALOG.filter((m) => {
      if (ownerFilter && m.owner !== ownerFilter) return false;
      if (!q) return true;
      const hay = `${m.name} ${m.short} ${m.definition} ${m.sql} ${m.uses_in.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, ownerFilter]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
            <BookOpen className="h-3.5 w-3.5" /> Data catalog · semantic layer
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-[34px] md:leading-[1.1]">
            {METRIC_CATALOG.length} metrics · defined once · used everywhere
          </h1>
          <p className="max-w-2xl text-sm text-white/75">
            One definition of "ATV", "breakage", "HHI", "CLV" that every page agrees on. Pipeline, SQL, owner, and every dashboard where the metric appears. Future dbt semantic-layer ready.
          </p>
        </div>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-tile">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            aria-label="Search catalog"
            placeholder="Search metrics, SQL, definition…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-white pl-8 pr-3 text-sm focus:border-[#F9C349] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={
              'rounded-full border px-2.5 py-1 text-[11px] font-medium transition ' +
              (ownerFilter === null
                ? 'border-[#DA9712] bg-[#FDF5E0] text-[#6F4D0A]'
                : 'border-border bg-white hover:bg-muted')
            }
            onClick={() => setOwnerFilter(null)}
          >
            All owners
          </button>
          {owners.map((o) => (
            <button
              key={o}
              type="button"
              className={
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition ' +
                (ownerFilter === o
                  ? 'border-[#DA9712] bg-[#FDF5E0] text-[#6F4D0A]'
                  : 'border-border bg-white hover:bg-muted')
              }
              onClick={() => setOwnerFilter(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#FDF5E0] text-[#6F4D0A]">{m.short}</Badge>
                <CardTitle className="text-base">{m.name}</CardTitle>
                <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {m.unit}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="leading-relaxed text-foreground">{m.definition}</p>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  SQL
                </p>
                <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
                  {m.sql}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Database className="h-3 w-3" /> Pipeline
                  </p>
                  <p className="mt-0.5 font-mono text-foreground">{m.pipeline}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <User className="h-3 w-3" /> Owner
                  </p>
                  <p className="mt-0.5 text-foreground">{m.owner}</p>
                </div>
              </div>

              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Link2 className="h-3 w-3" /> Appears in
                </p>
                <div className="flex flex-wrap gap-1">
                  {m.uses_in.map((u) => (
                    <Badge key={u} variant="outline" className="font-mono text-[10px]">
                      {u}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
