'use client';

import { Download, X } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { exportRows, type CsvColumn } from '@/lib/csv';

type Props<T extends Record<string, unknown>> = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: T[];
  columns: { key: keyof T | string; label: string; align?: 'left' | 'right'; format?: (row: T) => string | number }[];
  exportFilename?: string;
};

/**
 * Generic drill-through modal. Click a summary bar/tile and descend into the
 * row-level slice. Comes with CSV export.
 */
export function DrillThroughModal<T extends Record<string, unknown>>({
  open,
  onClose,
  title,
  subtitle,
  rows,
  columns,
  exportFilename,
}: Props<T>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const exportCsv = () => {
    const csvCols: CsvColumn<T>[] = columns.map((c) => ({
      key: c.key,
      label: c.label,
      format: c.format,
    }));
    exportRows(exportFilename ?? `${title.toLowerCase().replace(/\s+/g, '-')}.csv`, rows, csvCols);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0F1120]/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drill-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-nexus-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              Drill-through · {rows.length.toLocaleString()} rows
            </p>
            <h2 id="drill-title" className="mt-0.5 font-display text-xl font-semibold">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-white/75">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onClose}
              aria-label="Close drill-through"
              className="text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="max-h-[calc(85vh-72px)] overflow-auto p-4">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key as string} className={c.align === 'right' ? 'text-right' : undefined}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c) => {
                    const value = c.format ? c.format(r) : (r as Record<string, unknown>)[c.key as string];
                    return (
                      <TableCell
                        key={c.key as string}
                        className={c.align === 'right' ? 'text-right tabular-nums' : undefined}
                      >
                        {value == null ? '—' : String(value)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
