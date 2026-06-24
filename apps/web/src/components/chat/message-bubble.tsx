'use client';

import { AlertCircle, Check, Copy, RefreshCw, Sparkles, User } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { AuditDisclosure } from './audit-disclosure';
import type { ChatMessage } from './types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

/**
 * Single message bubble. User messages hug the right edge in a gold pill
 * with a label + timestamp above. Assistant messages are left-aligned cards
 * with an avatar, name, timestamp, copy button, optional audit disclosure,
 * and source chips. Error assistant messages are rose-tinted with Retry.
 */
export function ChatMessageBubble({ message, onRetry }: ChatMessageBubbleProps) {
  if (message.role === 'user') {
    return <UserBubble message={message} />;
  }
  return (
    <li className="flex justify-start">
      <AssistantBubble message={message} onRetry={onRetry} />
    </li>
  );
}

function UserBubble({ message }: { message: Extract<ChatMessage, { role: 'user' }> }) {
  return (
    <li className="flex justify-end">
      <div className="flex max-w-[85%] items-start gap-2">
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
            <span>· You</span>
          </span>
          <div className="rounded-2xl rounded-br-sm bg-gradient-to-br from-[#F9C349] to-[#DA9712] px-4 py-2.5 text-sm leading-relaxed text-[#0F1120] shadow-[0_4px_12px_rgba(249,195,73,0.25)]">
            <p className="whitespace-pre-wrap text-balance">{message.content}</p>
          </div>
        </div>
        <span
          aria-hidden
          className="mt-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A1D33] text-[#F9C349]"
        >
          <User className="h-3.5 w-3.5" />
        </span>
      </div>
    </li>
  );
}

function AssistantBubble({
  message,
  onRetry,
}: {
  message: Extract<ChatMessage, { role: 'assistant' }>;
  onRetry?: (message: ChatMessage) => void;
}) {
  const isError = message.status === 'error';

  return (
    <div className="flex w-full max-w-[92%] items-start gap-2">
      <span
        aria-hidden
        className={cn(
          'mt-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[#0F1120] shadow-[0_3px_10px_rgba(249,195,73,0.35)]',
          isError
            ? 'from-rose-200 to-rose-400 text-rose-900'
            : 'from-[#F9C349] to-[#DA9712]',
        )}
      >
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </span>
      <div className="flex w-full flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>{isError ? 'Nexus AI · error' : 'Nexus AI'}</span>
          <span aria-hidden>·</span>
          <time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
        </span>
        <article
          className={cn(
            'relative rounded-2xl rounded-tl-sm border bg-white px-4 py-3 shadow-tile',
            isError ? 'border-rose-200 bg-rose-50/60' : 'border-border',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                'flex-1 whitespace-pre-wrap text-sm leading-relaxed text-balance',
                isError ? 'text-rose-900' : 'text-foreground',
              )}
            >
              {message.content}
            </p>
            {!isError ? <CopyButton text={message.content} /> : null}
          </div>

          {message.sql ? (
            <AuditDisclosure
              sql={message.sql}
              tables={message.tables}
              rowCount={message.rowCount}
            />
          ) : null}

          {message.sources && message.sources.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {message.sources.map((source) => (
                <span
                  key={source}
                  className="inline-flex items-center gap-1 rounded-full border border-[#F9C349]/40 bg-[#FDF5E0] px-2 py-0.5 text-[10px] font-medium text-[#6F4D0A]"
                >
                  {source}
                </span>
              ))}
            </div>
          ) : null}

          {isError && onRetry ? (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onRetry(message)}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable in non-secure contexts; silently degrade
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : 'Copy answer'}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[#DA9712]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
