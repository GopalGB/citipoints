'use client';

import { Sparkles } from 'lucide-react';

/**
 * Three-dot typing indicator bubble — rendered on the left side while
 * the assistant is composing a response. Feels alive without being loud.
 */
export function TypingIndicator() {
  return (
    <li className="flex justify-start" aria-live="polite" aria-label="Assistant is typing">
      <div className="flex w-full max-w-[92%] items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F9C349] to-[#DA9712] text-[#0F1120] shadow-[0_3px_10px_rgba(249,195,73,0.35)]"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Nexus AI is thinking…
          </span>
          <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-white px-4 py-3 shadow-tile">
            <span
              className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#F9C349]"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#DA9712]"
              style={{ animationDelay: '160ms' }}
            />
            <span
              className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#F2714C]"
              style={{ animationDelay: '320ms' }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
