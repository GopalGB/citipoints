'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console for ops; a Sentry/Datadog hook would slot in here.
    // eslint-disable-next-line no-console
    console.error('[dashboard:error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard error
        </p>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Something broke while loading this view.
        </h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          The warehouse returned an error or the API is unreachable. Retry once,
          and if it persists check the API health endpoint or the ops channel.
        </p>
        {error.digest ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            ref: {error.digest}
          </p>
        ) : null}
      </div>
      <Button type="button" onClick={reset}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
