'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAED, formatInt } from '@/lib/format';
import type { TopProductItem } from '@/lib/types';

export function TopProductsTable({ rows }: { rows: TopProductItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="text-right">Units</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.sku_id} className="h-11">
            <TableCell className="font-medium">{row.product_name}</TableCell>
            <TableCell className="text-muted-foreground">{row.brand}</TableCell>
            <TableCell className="text-muted-foreground">{row.category}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAED(row.revenue)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(row.units)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No product revenue in the current window.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
