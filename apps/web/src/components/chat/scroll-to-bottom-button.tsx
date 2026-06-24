'use client';

import { ArrowDown } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ScrollToBottomButtonProps {
  show: boolean;
  hasUnread: boolean;
  onClick: () => void;
}

/**
 * Floating pill that appears when the user has scrolled up away from the
 * live tail. Shows an "new message" dot when a response arrives while the
 * user is reading history.
 */
export function ScrollToBottomButton({
  show,
  hasUnread,
  onClick,
}: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      aria-label={hasUnread ? 'Jump to new message' : 'Scroll to latest'}
      className={cn(
        'absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-tile transition-all',
        'hover:border-[#F9C349] hover:bg-[#FDF5E0]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        show
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        {hasUnread ? 'New message' : 'Jump to latest'}
        {hasUnread ? (
          <span
            aria-hidden
            className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#F2714C]"
          />
        ) : null}
      </span>
    </button>
  );
}
