'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { CopilotHints } from './copilot-hints';

interface HintsDrawerProps {
  open: boolean;
  prompts: string[];
  title: string;
  onPick: (prompt: string) => void;
  onClose: () => void;
}

/**
 * Mobile-only bottom sheet for the copilot hints. Slides up from the
 * bottom edge on `open`. Backdrop dismisses. Esc dismisses. Focus is
 * not trapped aggressively because the content is purely suggestion chips.
 */
export function HintsDrawer({
  open,
  prompts,
  title,
  onPick,
  onClose,
}: HintsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-40 lg:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      role="dialog"
      aria-modal={open}
      aria-label="Suggested questions"
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close hints"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-[#0F1120]/50 transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-tile transition-transform',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="flex items-center justify-between pb-2">
          <h3 className="font-display text-sm font-semibold text-foreground">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hints"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <CopilotHints
          variant="rail"
          prompts={prompts}
          title={title}
          onPick={(prompt) => {
            onPick(prompt);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
