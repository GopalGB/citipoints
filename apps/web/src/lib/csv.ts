/**
 * Client-side CSV export. No dependencies. Handles comma/quote escaping and BOM for Excel.
 */

function escape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type CsvColumn<T> = {
  key: keyof T | string;
  label: string;
  format?: (row: T) => string | number | null | undefined;
};

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const value = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
        return escape(value);
      })
      .join(','),
  );
  return [header, ...body].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined') return;
  const BOM = '\uFEFF'; // helps Excel detect UTF-8
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRows<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, toCsv(rows, columns));
}
