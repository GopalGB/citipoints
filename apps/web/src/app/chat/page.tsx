'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageSquareText,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatComposer, type ChatComposerHandle } from '@/components/chat/composer';
import { CopilotHints } from '@/components/chat/copilot-hints';
import { ChatEmptyState } from '@/components/chat/empty-state';
import { HintsDrawer } from '@/components/chat/hints-drawer';
import { ChatMessageBubble } from '@/components/chat/message-bubble';
import { ScrollToBottomButton } from '@/components/chat/scroll-to-bottom-button';
import type { ChatMessage } from '@/components/chat/types';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const STARTER_PROMPTS: string[] = [
  "What's my revenue this week?",
  'Which store is underperforming?',
  'Show me churn risk by tier',
  'Top 5 bundles by lift',
  'How many Nexus did we issue vs redeem last month?',
  'Which Platinum members have > 10K Nexus and high churn risk?',
];

const EMPTY_STATE_PROMPTS = STARTER_PROMPTS.slice(0, 4);
const STICK_THRESHOLD_PX = 80;

function randomId(prefix: string): string {
  const seed =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${seed}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [hintsOpen, setHintsOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);

  const composerRef = useRef<ChatComposerHandle>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const askMutation = useMutation({
    mutationFn: (question: string) => api.chat(question),
  });

  // Auto-focus composer on mount for keyboard-first users.
  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  // Global keyboard shortcuts: Cmd/Ctrl+K focuses composer.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === 'k';
      if (isK && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        composerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Track scroll position so we don't yank users back down while they read.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const distanceFromBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const isAtBottom = distanceFromBottom < STICK_THRESHOLD_PX;
      stickToBottom.current = isAtBottom;
      setAtBottom(isAtBottom);
      if (isAtBottom) setHasUnread(false);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll when new content arrives, unless user scrolled up.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (stickToBottom.current) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    } else {
      // User is reading history — mark new arrivals as unread.
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && last.status !== 'pending') {
        setHasUnread(true);
      }
    }
  }, [messages]);

  const jumpToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    stickToBottom.current = true;
    setHasUnread(false);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, []);

  const sendQuestion = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || askMutation.isPending) return;

      const userMsg: ChatMessage = {
        id: randomId('u'),
        role: 'user',
        content: q,
        timestamp: nowIso(),
      };
      const pendingId = randomId('a');
      const pendingMsg: ChatMessage = {
        id: pendingId,
        role: 'assistant',
        content: '',
        timestamp: nowIso(),
        status: 'pending',
      };

      stickToBottom.current = true;
      setHasUnread(false);
      setMessages((prev) => [...prev, userMsg, pendingMsg]);
      setInputValue('');

      askMutation.mutate(q, {
        onSuccess: (res) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === pendingId
                ? {
                    id: msg.id,
                    role: 'assistant',
                    content: res.answer,
                    timestamp: nowIso(),
                    status: 'ok',
                    sql: res.audit?.executed_sql ?? null,
                    tables: res.audit?.retrieved_tables ?? [],
                    rowCount: res.audit?.row_count ?? null,
                    sources: res.audit?.retrieved_tables ?? [],
                    followUps: res.follow_ups ?? [],
                    question: q,
                  }
                : msg,
            ),
          );
        },
        onError: (err: Error) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === pendingId
                ? {
                    id: msg.id,
                    role: 'assistant',
                    content: `The CLI call failed: ${err.message}`,
                    timestamp: nowIso(),
                    status: 'error',
                    question: q,
                  }
                : msg,
            ),
          );
        },
      });
    },
    [askMutation],
  );

  const handleRetry = useCallback(
    (failed: ChatMessage) => {
      if (failed.role !== 'assistant' || !failed.question) return;
      setMessages((prev) => prev.filter((m) => m.id !== failed.id));
      sendQuestion(failed.question);
    },
    [sendQuestion],
  );

  const handlePickStarter = useCallback(
    (prompt: string) => {
      sendQuestion(prompt);
    },
    [sendQuestion],
  );

  const handlePickRail = useCallback((prompt: string) => {
    composerRef.current?.setValue(prompt);
  }, []);

  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    setMessages([]);
    setInputValue('');
    setHasUnread(false);
    composerRef.current?.focus();
  }, [messages.length]);

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg && msg.role === 'assistant' && msg.status === 'ok') return msg;
    }
    return null;
  }, [messages]);

  const latestFollowUps =
    latestAssistant && latestAssistant.role === 'assistant'
      ? latestAssistant.followUps ?? []
      : [];
  const railPrompts =
    latestFollowUps.length > 0 ? latestFollowUps : STARTER_PROMPTS.slice(0, 4);
  const railTitle = latestFollowUps.length > 0 ? 'Try next' : 'Starter prompts';

  // Render: filter out pending bubbles so we can render the typing indicator
  // as a distinct component (cleaner than a "pending" bubble variant).
  const visibleMessages = messages.filter(
    (msg) => !(msg.role === 'assistant' && msg.status === 'pending'),
  );
  const isThinking = messages.some(
    (msg) => msg.role === 'assistant' && msg.status === 'pending',
  );

  return (
    <div className="animate-fade-up flex h-[calc(100vh-8rem)] flex-col gap-4">
      <ChatHeader
        messageCount={messages.length}
        hintsOpen={hintsOpen}
        onToggleHints={() => setHintsOpen((open) => !open)}
        onOpenDrawer={() => setDrawerOpen(true)}
        onClear={handleClear}
      />

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className="relative flex min-h-0 flex-col rounded-2xl border border-border bg-surface shadow-tile"
          aria-label="Chat conversation"
        >
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation"
          >
            {messages.length === 0 ? (
              <ChatEmptyState
                prompts={EMPTY_STATE_PROMPTS}
                onPick={handlePickStarter}
              />
            ) : (
              <ul className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                {visibleMessages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    onRetry={handleRetry}
                  />
                ))}
                {isThinking ? <TypingIndicator /> : null}
              </ul>
            )}
          </div>

          <ScrollToBottomButton
            show={!atBottom && messages.length > 0}
            hasUnread={hasUnread}
            onClick={jumpToBottom}
          />

          <div className="border-t border-border bg-gradient-to-b from-white to-[#FDFCF8] px-4 py-3 sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <ChatComposer
                ref={composerRef}
                value={inputValue}
                onChange={setInputValue}
                onSubmit={() => sendQuestion(inputValue)}
                isSending={askMutation.isPending}
              />
            </div>
          </div>
        </section>

        <aside
          className={
            hintsOpen
              ? 'hidden min-h-0 overflow-hidden lg:block'
              : 'hidden'
          }
          aria-label="Suggested questions"
        >
          <div className="sticky top-4 flex max-h-full flex-col gap-3">
            <CopilotHints
              variant="rail"
              prompts={railPrompts}
              onPick={handlePickRail}
              title={railTitle}
            />
            <div className="rounded-2xl border border-border bg-white p-4 text-[11px] leading-relaxed text-muted-foreground shadow-tile">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                What Nexus AI can see
              </p>
              <p>
                Every answer is grounded in a schema snapshot plus live KPIs
                (issuance, redemption, breakage, churn, CLV, basket rules).
                The executed SQL is attached to each response so you can audit
                the source before trusting the number.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <HintsDrawer
        open={drawerOpen}
        prompts={railPrompts}
        title={railTitle}
        onPick={handlePickRail}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

interface ChatHeaderProps {
  messageCount: number;
  hintsOpen: boolean;
  onToggleHints: () => void;
  onOpenDrawer: () => void;
  onClear: () => void;
}

function ChatHeader({
  messageCount,
  hintsOpen,
  onToggleHints,
  onOpenDrawer,
  onClear,
}: ChatHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#F9C349] to-[#DA9712] text-[#0F1120] shadow-[0_4px_12px_rgba(249,195,73,0.35)]">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <h1 className="font-display text-xl font-semibold md:text-2xl">
            Nexus AI chat
          </h1>
          <Badge variant="primary" className="text-[10px]">
            Claude CLI · grounded
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <MessageSquareText className="h-3 w-3" /> audit-trail ON
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask the coalition anything. Every answer ships with the SQL an
          analyst would have run.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenDrawer}
          className="inline-flex lg:hidden"
          aria-label="Show suggested questions"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          Hints
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onToggleHints}
          className="hidden lg:inline-flex"
          aria-pressed={hintsOpen}
          aria-label={hintsOpen ? 'Collapse prompt rail' : 'Expand prompt rail'}
        >
          {hintsOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Hints
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClear}
          disabled={messageCount === 0}
          aria-label="Clear conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </header>
  );
}
