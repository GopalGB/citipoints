'use client';

import { Check, ChevronDown, Copy, Database } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface AuditDisclosureProps {
  sql: string;
  tables?: string[];
  rowCount?: number | null;
}

/**
 * "How I got this" disclosure block — surfaces the SQL an analyst would have
 * run, the tables touched, and row count. Collapsed by default so the bubble
 * stays prose-first.
 */
export function AuditDisclosure({ sql, tables, rowCount }: AuditDisclosureProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable in non-secure contexts; silently degrade
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-[#FDFCF8]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/60"
      >
        <Database className="h-3.5 w-3.5 text-[#DA9712]" aria-hidden />
        <span className="uppercase tracking-[0.14em]">How I got this</span>
        {rowCount != null ? (
          <span className="rounded-full bg-[#FDF5E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#6F4D0A]">
            {rowCount.toLocaleString()} rows
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border bg-[#1A1D33] px-3 py-2 text-[11px] text-[#F8F7F3]">
          <div className="flex items-center justify-between gap-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F9C349]">
              Executed SQL
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'SQL copied' : 'Copy SQL'}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#F9C349] transition hover:bg-[#F9C349]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9C349]"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#F8F7F3]/90">
            {sql}
          </pre>
          {tables && tables.length > 0 ? (
            <p className="mt-2 border-t border-[#F9C349]/15 pt-2 text-[10px] text-[#F8F7F3]/70">
              Tables touched:{' '}
              <span className="text-[#F9C349]">{tables.join(', ')}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
