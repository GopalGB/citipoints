'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  Calendar,
  Coins,
  Crown,
  Download,
  FileSpreadsheet,
  Layers,
  LifeBuoy,
  Mail,
  RefreshCw,
  Sparkles,
  Store,
  Target,
  TrendingUp,
} from 'lucide-react';
import { type ComponentType, useMemo } from 'react';
import * as XLSX from 'xlsx';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Insight, InsightBundle, InsightPriority } from '@/lib/types';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  coins: Coins,
  calendar: Calendar,
  store: Store,
  crown: Crown,
  sparkles: Sparkles,
  layers: Layers,
  'life-buoy': LifeBuoy,
  award: Award,
  target: Target,
};

const PRIORITY_STYLES: Record<
  InsightPriority,
  { dot: string; label: string; chip: string }
> = {
  info: { dot: 'bg-primary', label: 'INFO', chip: 'bg-primary/10 text-primary' },
  opportunity: {
    dot: 'bg-emerald-500',
    label: 'OPPORTUNITY',
    chip: 'bg-emerald-50 text-emerald-700',
  },
  warning: {
    dot: 'bg-amber-500',
    label: 'WARNING',
    chip: 'bg-amber-50 text-amber-700',
  },
  critical: {
    dot: 'bg-rose-500',
    label: 'CRITICAL',
    chip: 'bg-rose-50 text-rose-700',
  },
};

/** Extra tabular data to ship as additional sheets in the Excel workbook. */
export interface ExportRowsSheet {
  sheetName: string;
  rows: Record<string, unknown>[];
}

interface Props {
  /** Unique query key for this page's insights (used by React Query for caching + refetch). */
  queryKey: string[];
  /** Loader returning the InsightBundle for this page. */
  loader: () => Promise<InsightBundle>;
  /** Human-readable page title — used in the email subject line and print header. */
  pageTitle: string;
  /** Optional extra dynamic stats to dump into the email body (key: "Revenue", value: "AED 5.28M"). */
  emailStats?: Record<string, string>;
  /**
   * Optional rich tabular data to include as additional worksheets in the Excel
   * export. Each entry becomes a sheet with a header row derived from the
   * union of row keys. Useful for shipping market-basket rules, fraud rings,
   * aging buckets, etc. into a single audit-ready workbook.
   */
  exportRows?: ExportRowsSheet[];
}

// Excel sheet names are capped at 31 chars and cannot contain: \ / ? * [ ]
const sanitizeSheetName = (name: string): string =>
  name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'page';

const pad = (n: number): string => String(n).padStart(2, '0');

const buildTimestamp = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

/**
 * Auto-generated AI insights panel with Regenerate / Email / Capture actions.
 * Inspired by id8-dashboard style — every page gets one so viewers see
 * "what changed, why it matters, what to do" without hunting through charts.
 */
export function PageAiSummary({
  queryKey,
  loader,
  pageTitle,
  emailStats,
  exportRows,
}: Props) {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: loader,
    staleTime: 30_000,
  });

  const generatedLabel = useMemo(() => {
    if (!dataUpdatedAt) return 'generating…';
    const diffMin = Math.round((Date.now() - dataUpdatedAt) / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    const h = Math.round(diffMin / 60);
    return `${h}h ago`;
  }, [dataUpdatedAt]);

  const onEmail = () => {
    const subject = `Nexus · ${pageTitle} — AI summary`;
    const header = `Nexus Partner Analytics — ${pageTitle}\nGenerated: ${new Date().toLocaleString(
      'en-GB',
      { dateStyle: 'medium', timeStyle: 'short' },
    )}\n\n`;

    const statsBlock = emailStats
      ? `KEY STATS\n${Object.entries(emailStats)
          .map(([k, v]) => `• ${k}: ${v}`)
          .join('\n')}\n\n`
      : '';

    const insightsBlock =
      data?.insights && data.insights.length > 0
        ? `INSIGHTS\n${data.insights
            .map(
              (it, i) =>
                `${i + 1}. [${it.priority.toUpperCase()}] ${it.title}\n   ${it.text}${
                  it.action ? `\n   → ${it.action}` : ''
                }`,
            )
            .join('\n\n')}`
        : 'No insights available.';

    const body = `${header}${statsBlock}${insightsBlock}\n\n—\nView live: ${
      typeof window !== 'undefined' ? window.location.href : ''
    }`;

    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (typeof window !== 'undefined') window.location.href = href;
  };

  const onCapture = () => {
    // Print-to-PDF is the cheapest, highest-fidelity "capture" — browsers ship it free.
    if (typeof window !== 'undefined') window.print();
  };

  const onExcel = () => {
    if (typeof window === 'undefined') return;

    const now = new Date();
    const generatedAt = now.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const windowLabel =
      (emailStats && (emailStats['Window'] ?? emailStats['Time window'])) ?? '';

    const wb = XLSX.utils.book_new();

    // ── Sheet 1 — Summary ──────────────────────────────────────────
    const summaryRows: Array<[string, string]> = [
      ['Page', pageTitle],
      ['Window', windowLabel],
      ['Generated', generatedAt],
      ['Source URL', window.location.href],
      ['', ''],
      ['AI summary', data?.question ?? 'No AI summary available.'],
    ];

    if (emailStats && Object.keys(emailStats).length > 0) {
      summaryRows.push(['', '']);
      summaryRows.push(['Metric', 'Value']);
      for (const [k, v] of Object.entries(emailStats)) {
        summaryRows.push([k, v]);
      }
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 72 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, sanitizeSheetName('Summary'));

    // ── Sheet 2 — Insights ─────────────────────────────────────────
    const insightRows = (data?.insights ?? []).map((it, i) => ({
      '#': i + 1,
      Priority: it.priority.toUpperCase(),
      Title: it.title,
      Body: it.text,
      'Suggested action': it.action ?? '',
      'Evidence chart': it.evidence_chart_id ?? '',
    }));

    const insightSheet =
      insightRows.length > 0
        ? XLSX.utils.json_to_sheet(insightRows)
        : XLSX.utils.aoa_to_sheet([['No insights available.']]);
    if (insightRows.length > 0) {
      insightSheet['!cols'] = [
        { wch: 4 },
        { wch: 12 },
        { wch: 36 },
        { wch: 60 },
        { wch: 48 },
        { wch: 36 },
      ];
    }
    XLSX.utils.book_append_sheet(wb, insightSheet, sanitizeSheetName('Insights'));

    // ── Sheet 3 — Stats ────────────────────────────────────────────
    const statsRows: Array<Record<string, unknown>> =
      emailStats && Object.keys(emailStats).length > 0
        ? Object.entries(emailStats).map(([k, v]) => ({ Metric: k, Value: v }))
        : [{ Metric: 'No stats provided', Value: '' }];
    const statsSheet = XLSX.utils.json_to_sheet(statsRows);
    statsSheet['!cols'] = [{ wch: 32 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, statsSheet, sanitizeSheetName('Stats'));

    // ── Extra sheets from caller ───────────────────────────────────
    if (exportRows && exportRows.length > 0) {
      const used = new Set(wb.SheetNames.map((n) => n.toLowerCase()));
      for (const entry of exportRows) {
        if (!entry.rows || entry.rows.length === 0) continue;
        // Build a stable column order from the union of row keys (first-seen order).
        const columns: string[] = [];
        const seen = new Set<string>();
        for (const row of entry.rows) {
          for (const k of Object.keys(row)) {
            if (!seen.has(k)) {
              seen.add(k);
              columns.push(k);
            }
          }
        }
        const sheet = XLSX.utils.json_to_sheet(entry.rows, { header: columns });
        sheet['!cols'] = columns.map(() => ({ wch: 22 }));

        // Guarantee unique sheet names even after sanitization.
        let name = sanitizeSheetName(entry.sheetName);
        let suffix = 2;
        while (used.has(name.toLowerCase())) {
          const base = sanitizeSheetName(entry.sheetName).slice(0, 28);
          name = `${base} ${suffix++}`;
        }
        used.add(name.toLowerCase());
        XLSX.utils.book_append_sheet(wb, sheet, name);
      }
    }

    const filename = `nexus-${slugify(pageTitle)}-${buildTimestamp(now)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const onRegenerate = () => {
    void refetch();
  };

  return (
    <section
      aria-live="polite"
      aria-label={`AI insights summary for ${pageTitle}`}
      className="rounded-2xl border border-[#E8E5DC] bg-gradient-to-br from-white to-[#FDF5E0]/50 p-4 shadow-tile"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F9C349] to-[#DA9712] text-[#0F1120] shadow-[0_4px_12px_rgba(249,195,73,0.35)]">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                AI summary
              </h2>
              <Badge variant="outline" className="text-[10px]">
                auto · {generatedLabel}
              </Badge>
            </div>
            {data?.question ? (
              <p className="mt-1 text-sm text-muted-foreground text-balance">
                {data.question}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {isLoading ? 'Reading the data…' : 'AI insights unavailable.'}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRegenerate}
            disabled={isFetching}
            aria-label="Regenerate AI insights"
            title="Re-read the latest data"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Regenerate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onEmail}
            aria-label="Email this page"
            title="Email the AI summary as plaintext"
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExcel}
            aria-label="Download this page as Excel workbook"
            title="Download Summary + Insights + Stats as .xlsx"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={onCapture}
            aria-label="Capture page as PDF"
            title="Use browser print → Save as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Capture
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-muted/50"
              aria-hidden
            />
          ))}
        </div>
      ) : !data || data.insights.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          No anomalies or opportunities detected in the current window. Try widening
          the filters.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.insights.slice(0, 6).map((insight) => (
            <InsightPill key={insight.id} insight={insight} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InsightPill({ insight }: { insight: Insight }) {
  const style = PRIORITY_STYLES[insight.priority];
  const Icon = ICON_MAP[insight.icon ?? ''] ?? Sparkles;
  return (
    <li>
      <article className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-white/90 p-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', style.dot)} aria-hidden />
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
              style.chip,
            )}
          >
            {style.label}
          </span>
          <Icon className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </div>
        <h3 className="text-sm font-semibold leading-snug text-foreground text-balance">
          {insight.title}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground text-balance">
          {insight.text}
        </p>
        {insight.action ? (
          <p className="mt-auto rounded-md bg-[#FDF5E0] px-2 py-1.5 text-[11px] leading-snug text-foreground">
            <span className="font-semibold">Next:</span> {insight.action}
          </p>
        ) : null}
      </article>
    </li>
  );
}
