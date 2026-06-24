'use client';

import { type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  id?: string;
  title: string;
  description?: string;
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  className?: string;
  height?: number | string;
  children: ReactNode;
}

export function ChartShell({
  id,
  title,
  description,
  headerAccessory,
  footer,
  className,
  height = 280,
  children,
}: Props) {
  return (
    <Card id={id} className={cn('flex h-full flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-0">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {headerAccessory}
      </CardHeader>
      <CardContent className="mt-3 flex-1">
        <div style={{ height }}>{children}</div>
      </CardContent>
      {footer ? (
        <div className="border-t border-border/60 bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
