'use client';

import { Send } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ChatComposerHandle {
  focus: () => void;
  setValue: (value: string) => void;
  clear: () => void;
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSending: boolean;
  disabled?: boolean;
}

const MAX_LINES = 5;
const LINE_HEIGHT_PX = 22;
const BASE_PADDING_PX = 20;

/**
 * Auto-growing textarea composer. Plain Enter submits, Shift+Enter inserts a
 * newline, Cmd/Ctrl+Enter also submits. Escape clears the draft. Caps at
 * ~5 lines before the textarea starts scrolling internally.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    { value, onChange, onSubmit, isSending, disabled = false },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        setValue: (next: string) => {
          onChange(next);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(next.length, next.length);
          });
        },
        clear: () => {
          onChange('');
          textareaRef.current?.focus();
        },
      }),
      [onChange],
    );

    // Autosize after every change. Reset height first so shrink works too.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const maxHeight = MAX_LINES * LINE_HEIGHT_PX + BASE_PADDING_PX;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [value]);

    const canSend = !isSending && !disabled && value.trim().length > 0;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        if (value.length > 0) {
          event.preventDefault();
          onChange('');
        }
        return;
      }
      const submitCombo =
        event.key === 'Enter' && (event.metaKey || event.ctrlKey);
      const submitPlain = event.key === 'Enter' && !event.shiftKey;
      if (submitCombo || submitPlain) {
        event.preventDefault();
        if (canSend) onSubmit();
      }
    };

    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSubmit();
        }}
      >
        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border border-border bg-white p-2 shadow-tile transition',
            'focus-within:border-[#F9C349] focus-within:ring-2 focus-within:ring-primary/40',
            disabled && 'opacity-60',
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Nexus — revenue, churn, baskets, liability…"
            rows={1}
            disabled={disabled}
            aria-label="Chat message"
            className="min-h-[40px] resize-none border-0 bg-transparent px-2 py-2 text-sm leading-[22px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ maxHeight: MAX_LINES * LINE_HEIGHT_PX + BASE_PADDING_PX }}
          />
          <Button
            type="submit"
            disabled={!canSend}
            aria-label={isSending ? 'Sending message' : 'Send message (Cmd+Enter)'}
            className="h-10 shrink-0 gap-1.5"
          >
            <Send className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{isSending ? 'Thinking' : 'Send'}</span>
            <span
              aria-hidden
              className="ml-1 hidden items-center rounded border border-[#0F1120]/20 bg-[#0F1120]/10 px-1 font-mono text-[10px] text-[#0F1120]/75 sm:inline-flex"
            >
              ⌘↵
            </span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>{' '}
              focus
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ⌘↵
              </kbd>{' '}
              send
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                Shift+↵
              </kbd>{' '}
              newline
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>{' '}
              clear
            </span>
          </span>
          <span aria-hidden>{value.length > 0 ? `${value.length} chars` : ''}</span>
        </div>
      </form>
    );
  },
);
