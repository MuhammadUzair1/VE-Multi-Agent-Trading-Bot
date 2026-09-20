'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => Promise<void> | void;
  isLoading: boolean;
}

export default function ChatPanel({ messages, onSend, isLoading }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isLoading]);

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    await onSend(content);
  };

  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel">
      <h2 className="border-b border-base-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        FinAlly Assistant
      </h2>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-gray-600">
            Ask FinAlly about your portfolio, request analysis, or tell it to make a trade.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-accent-blue/20 text-gray-100' : 'bg-white/5 text-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.actions && m.actions.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-base-border pt-2">
                  {m.actions.map((action, i) => (
                    <li
                      key={i}
                      className={`text-xs ${action.success ? 'text-up' : 'text-down'}`}
                    >
                      {action.success ? '✓' : '✗'} {action.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-500">Thinking…</div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-base-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask FinAlly…"
          className="flex-1 rounded border border-base-border bg-base-bg px-2 py-1.5 text-sm text-gray-200"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isLoading || !draft.trim()}
          className="rounded bg-accent-purple px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </section>
  );
}
