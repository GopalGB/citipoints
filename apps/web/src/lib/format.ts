const aed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  maximumFractionDigits: 0,
});

const aedPrecise = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  maximumFractionDigits: 2,
});

const int = new Intl.NumberFormat('en-US');

export function formatAED(value: number, precise = false): string {
  return (precise ? aedPrecise : aed).format(value);
}

export function formatInt(value: number): string {
  return int.format(Math.round(value));
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDelta(delta: number | null | undefined): string {
  if (delta == null) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * AED in compact form for KPI tiles where full-fat "AED 5,279,500"
 * would overflow a narrow cell. Keeps "AED 264" intact for small values,
 * collapses to "AED 5.3K" / "AED 5.28M" / "AED 1.24B" above thresholds.
 */
export function formatAEDCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `AED ${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `AED ${(value / 1_000).toFixed(1)}K`;
  return aed.format(value);
}
