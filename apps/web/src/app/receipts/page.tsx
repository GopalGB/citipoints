'use client';

/**
 * Receipts — Off-SKU Nexus earning via receipt OCR.
 *
 * Members scan any UAE supermarket / QSR receipt; the backend synthesises a
 * plausible receipt (Claude-backed in demo mode) and runs the Nexus rule
 * engine. Partner merchants earn 1.0 Nexus/AED; non-partner receipts earn
 * 0.25 Nexus/AED and are capped at 500 Nexus/day.
 */

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
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
import { api } from '@/lib/api';
import { formatAED } from '@/lib/format';
import type { ReceiptScanResponse } from '@/lib/types';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

const DEMO_MEMBER = 'M-00042';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const HISTORY_KEY = 'nexus:receipts:history';
const HISTORY_LIMIT = 5;

// Minimal tiny-PNG so the "Try sample" buttons always have real base64 to POST.
// (1x1 transparent PNG — enough to satisfy the backend's size-only inspection.)
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface SampleReceipt {
  id: string;
  label: string;
  kind: 'partner' | 'non_partner';
  note: string;
}

const SAMPLES: SampleReceipt[] = [
  {
    id: 'sample-carrefour',
    label: 'Carrefour · weekly grocery',
    kind: 'partner',
    note: '6-10 line items · partner rate',
  },
  {
    id: 'sample-adnoc',
    label: 'ADNOC · fuel top-up',
    kind: 'non_partner',
    note: 'Off-SKU 0.25 Nexus/AED',
  },
  {
    id: 'sample-kfc',
    label: 'KFC · family bucket',
    kind: 'non_partner',
    note: 'QSR · cap 500/day',
  },
];

interface HistoryEntry {
  receipt_id: string;
  merchant: string;
  total_aed: number;
  points_awarded: number;
  txn_date: string;
  merchant_is_partner: boolean;
}

function readHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, HISTORY_LIMIT) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // storage disabled — degrade silently
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected reader output'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export default function ReceiptsPage() {
  const { timeWindow, setWindow, filters, anchor } = useWindowFilters(
    'nexus:window:receipts',
    'all',
  );
  void filters;

  const [memberId, setMemberId] = useState(DEMO_MEMBER);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptScanResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const scan = useMutation({
    mutationFn: (body: { image_base64: string; member_id: string }) => api.receiptScan(body),
    onSuccess: (data) => {
      setResult(data);
      setHistory((prev) => {
        const next: HistoryEntry[] = [
          {
            receipt_id: data.receipt_id,
            merchant: data.merchant,
            total_aed: data.total_aed,
            points_awarded: data.points_awarded,
            txn_date: data.txn_date,
            merchant_is_partner: data.merchant_is_partner,
          },
          ...prev.filter((h) => h.receipt_id !== data.receipt_id),
        ].slice(0, HISTORY_LIMIT);
        writeHistory(next);
        return next;
      });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : 'Scan failed');
    },
  });

  const handleFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are supported.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUploadError('File exceeds 10 MB limit.');
        return;
      }
      try {
        const b64 = await fileToBase64(file);
        scan.mutate({ image_base64: b64, member_id: memberId });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Could not read file');
      }
    },
    [memberId, scan],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const sendSample = useCallback(
    (_sample: SampleReceipt) => {
      setUploadError(null);
      scan.mutate({ image_base64: TINY_PNG_B64, member_id: memberId });
    },
    [memberId, scan],
  );

  const banner = useMemo(() => {
    const fallbackHeadline =
      'Receipt OCR · turn any supermarket receipt into Nexus.';
    const fallbackSubtitle =
      'Drop a scanned receipt and the rule engine awards Nexus on the fly — partner receipts earn 1.0 Nexus / AED, off-SKU receipts earn 0.25 Nexus / AED (capped at 500 / day).';
    return { fallbackHeadline, fallbackSubtitle };
  }, []);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
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
        page="receipts"
        kicker="Receipt OCR · Off-SKU earning"
        fallbackHeadline={banner.fallbackHeadline}
        fallbackSubtitle={banner.fallbackSubtitle}
        variant="light"
        polish
      />

      <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan a receipt</CardTitle>
            <p className="text-sm text-muted-foreground">
              Drop an image or click to browse. PNG/JPEG up to 10 MB.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload receipt image"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={`flex min-h-[160px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                dragActive
                  ? 'border-[#DA9712] bg-[#FDF5E0]/70'
                  : 'border-[#F9C349]/50 bg-[#FDF5E0]/30 hover:border-[#DA9712]'
              }`}
            >
              <div>
                <p className="font-display text-base font-semibold text-[#6F4D0A]">
                  Drop a receipt (or click)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Demo mode synthesises a plausible UAE receipt; rule engine awards Nexus instantly.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="mb-1 block font-medium uppercase tracking-wide text-muted-foreground">
                  Member ID
                </span>
                <input
                  type="text"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="h-9 w-48 rounded-md border border-border bg-background px-3 font-mono text-sm"
                  aria-label="Member ID"
                />
              </label>
              {uploadError ? (
                <span className="text-xs font-medium text-rose-700" role="alert">
                  {uploadError}
                </span>
              ) : null}
            </div>

            {scan.isPending ? (
              <NexusLoader label="Scanning receipt…" sublabel="Synthesising OCR + running rules" height={140} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demo tray</CardTitle>
            <p className="text-xs text-muted-foreground">Pre-selected receipts for quick demos.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => sendSample(s)}
                disabled={scan.isPending}
                className="flex w-full flex-col items-start gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:border-[#DA9712]/60 hover:bg-[#FDF5E0]/50 disabled:opacity-50"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <Badge variant={s.kind === 'partner' ? 'success' : 'outline'}>
                    {s.kind === 'partner' ? 'Partner' : 'Off-SKU'}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">{s.note}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {result ? <ResultCard result={result} /> : null}

      {history.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent scans</CardTitle>
            <p className="text-xs text-muted-foreground">
              Last {history.length} receipts · stored on this device.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Nexus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.receipt_id}>
                    <TableCell className="font-mono text-xs">{h.receipt_id}</TableCell>
                    <TableCell>
                      <span className="mr-2">{h.merchant}</span>
                      {h.merchant_is_partner ? (
                        <Badge variant="success">partner</Badge>
                      ) : (
                        <Badge variant="outline">off-SKU</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{h.txn_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAED(h.total_aed)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-[#6F4D0A]">
                      +{h.points_awarded}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ResultCard({ result }: { result: ReceiptScanResponse }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <CardTitle className="text-base">{result.merchant}</CardTitle>
          {result.merchant_is_partner ? (
            <Badge variant="success">Partner merchant</Badge>
          ) : (
            <Badge variant="outline">Off-SKU</Badge>
          )}
          <Badge variant="primary">{result.confidence} confidence</Badge>
          {result.flags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {result.flags.map((f) => (
                <Badge key={f} variant="warning" className="text-[10px]">
                  {f.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {result.processing_time_ms} ms · {result.receipt_id}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
          <div>
            <div className="max-h-[340px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Line</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.line_items.map((item, i) => (
                    <TableRow key={`${item.sku}-${i}`}>
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={item.description}>
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAED(item.unit_price_aed, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAED(item.line_aed, true)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rule: <span className="text-foreground">{result.points_rule_applied}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-[#F9C349]/40 bg-[#FDF5E0]/40 p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B4820E]">
                Total · AED
              </p>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {formatAED(result.total_aed, true)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B4820E]">
                Points awarded
              </p>
              <p className="font-display text-3xl font-bold tabular-nums text-[#DA9712]">
                +{result.points_awarded.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">Nexus credited to member</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B4820E]">
                Receipt date
              </p>
              <p className="font-mono text-sm tabular-nums">{result.txn_date}</p>
            </div>
            <Button variant="outline" size="sm" type="button" disabled>
              Credit to ledger
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
