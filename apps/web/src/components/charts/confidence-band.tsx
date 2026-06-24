'use client';

/**
 * A minimal inline confidence-band visual for point-estimate + CI.
 * Rendered as: |----●----| with label.
 */
export function ConfidenceBand({
  point,
  lo,
  hi,
  min,
  max,
  format,
}: {
  point: number;
  lo: number;
  hi: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}) {
  const lower = min ?? Math.min(lo, point) * 0.95;
  const upper = max ?? Math.max(hi, point) * 1.05;
  const range = Math.max(upper - lower, 1e-6);
  const clamp = (n: number) => Math.max(0, Math.min(1, (n - lower) / range));
  const loPct = clamp(lo) * 100;
  const hiPct = clamp(hi) * 100;
  const pPct = clamp(point) * 100;

  const fmt = format ?? ((v: number) => v.toFixed(2));

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{fmt(lo)}</span>
        <span className="font-semibold tabular-nums text-foreground">{fmt(point)}</span>
        <span>{fmt(hi)}</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted">
        <div
          className="absolute top-0 h-2 rounded-full bg-[#F9C349]/50"
          style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
          aria-hidden
        />
        <div
          className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#DA9712] shadow"
          style={{ left: `${pPct}%` }}
          aria-label={`Point estimate: ${fmt(point)}`}
          title={`Point: ${fmt(point)} · 95% CI [${fmt(lo)}, ${fmt(hi)}]`}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">95% confidence interval</p>
    </div>
  );
}
