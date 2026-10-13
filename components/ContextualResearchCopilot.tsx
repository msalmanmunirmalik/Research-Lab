/**
 * Floating Ask AI — internal library/actions first (0 tokens), then LLM if needed.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SparklesIcon, XMarkIcon, ArrowUpIcon, StopIcon } from './icons';
import { getAuthHeaders } from '../utils/apiBase';

interface AssistantAction {
  tool: string;
  ok: boolean;
  summary: string;
  link?: string;
  navigateTo?: string;
  data?: {
    protocols?: Array<{ id: string; title: string; link: string }>;
    experiments?: Array<{ id: string; title: string; link: string }>;
    documents?: Array<{ id: string; title: string; link: string }>;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  mode?: 'assistant' | 'chat';
  source?: string;
}

function pageLabel(pathname: string): { label: string; hint: string } {
  if (pathname.startsWith('/lab-notebook')) {
    return { label: 'Personal notebook', hint: 'Ask about notes, experiments, or digests' };
  }
  if (pathname.startsWith('/protocols')) {
    return { label: 'Protocols', hint: 'Find protocols in your library, or ask for help' };
  }
  if (pathname.startsWith('/data-results')) {
    return { label: 'Data & Results', hint: 'Interpret packs, claims, and figures' };
  }
  if (pathname.startsWith('/grants')) {
    return { label: 'Grants', hint: 'Match calls or draft proposal sections' };
  }
  if (pathname.startsWith('/lab-workspace')) {
    return { label: 'Lab workspace', hint: 'Tasks, projects, and team coordination' };
  }
  if (pathname.startsWith('/experiment-tracker')) {
    return { label: 'Experiments', hint: 'Design, track, and analyze experiments' };
  }
  if (pathname.startsWith('/writing-studio')) {
    return { label: 'Writing studio', hint: 'Drafts, citations, literature, and AI assist' };
  }
  if (pathname.startsWith('/research-journey')) {
    return { label: 'Writing studio', hint: 'Draft from research' };
  }
  if (pathname.startsWith('/dashboard')) {
    return { label: 'Dashboard', hint: 'Notes, reminders, and research pulse' };
  }
  if (pathname.startsWith('/ai-research-agent')) {
    return { label: 'Writing studio', hint: 'Ask about your manuscript or research' };
  }
  return { label: 'RILOS', hint: 'Ask anything — or ask me to do it' };
}

const EXAMPLE_PROMPTS = [
  'Find the protocol for virology testing from my library',
  'Remind me to call Peter tomorrow',
  'Write in my notes: I got good results today',
  'List my reminders',
];

const ContextualResearchCopilot: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { label, hint } = pageLabel(location.pathname);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    abortRef.current = new AbortController();

    const pageContext = [
      `Current page: ${label} (${location.pathname})`,
      `User is working in RILOS.`,
      `Prefer INTERNAL library search and app actions before generating new content with AI.`,
      `You can take actions: find protocols/experiments, create notes, reminders/tasks, and calendar events.`,
    ].join('\n');

    try {
      const response = await axios.post(
        '/api/ai-research-agent/chat',
        {
          message: content,
          pageContext,
          conversation_history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          assistant: true,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        {
          headers: getAuthHeaders(),
          signal: abortRef.current.signal,
        }
      );

      const reply =
        response.data?.content ||
        response.data?.message ||
        'I could not generate a response. Check API keys in Settings.';
      const actions: AssistantAction[] = Array.isArray(response.data?.actions)
        ? response.data.actions
        : [];
      const mode = response.data?.mode === 'assistant' ? 'assistant' : 'chat';
      const source = response.data?.source || mode;
      const navigateTo =
        response.data?.navigateTo ||
        actions.find((a) => a.navigateTo)?.navigateTo ||
        actions.find((a) => a.ok && a.link && a.tool === 'find_protocol')?.link;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: reply, actions, mode, source } : m
        )
      );

      if (navigateTo && typeof navigateTo === 'string' && navigateTo.startsWith('/')) {
        navigate(navigateTo);
      }
    } catch (err: unknown) {
      if (axios.isCancel(err)) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage =
        ax.response?.data?.error || ax.message || 'Request failed';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Could not complete: ${errorMessage}` }
            : m
        )
      );
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-2 rounded-full bg-teal-800 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg shadow-teal-900/20 hover:bg-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          aria-label="Open Ask AI assistant"
        >
          <SparklesIcon className="h-4 w-4" />
          Ask AI
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[60] flex h-[min(560px,70vh)] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start gap-2 border-b border-slate-100 bg-gradient-to-br from-teal-50 to-white px-4 py-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-800 text-white">
              <SparklesIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900">Ask AI</p>
              <p className="text-[11px] text-slate-500 truncate">
                {label} — library first, then AI if needed
              </p>
            </div>
            <Link
              to="/dashboard"
              className="text-[11px] font-medium text-teal-800 hover:underline px-1 py-1"
              title="Notes & reminders"
            >
              Hub
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close assistant"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="px-1 text-[12px] text-slate-500">
                  I search your data first (no AI tokens), then call AI only if needed.
                </p>
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void send(ex)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[12px] text-slate-700 hover:border-teal-300 hover:bg-teal-50/50"
                  >
                    {ex}
                  </button>
                ))}
                <p className="px-1 pt-1 text-[11px] text-slate-400">{hint}</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <div
                  className={`rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ml-6 bg-teal-800 text-white'
                      : 'mr-4 border border-slate-100 bg-slate-50 text-slate-800'
                  }`}
                >
                  {m.content || (loading ? '…' : '')}
                </div>
                {m.role === 'assistant' && m.source === 'internal' ? (
                  <p className="mr-4 pl-1 text-[10px] font-medium uppercase tracking-wide text-teal-700">
                    From your library · no AI tokens
                  </p>
                ) : null}
                {m.role === 'assistant' && m.actions && m.actions.length > 0 ? (
                  <div className="mr-4 flex flex-wrap gap-1.5 pl-1">
                    {m.actions.map((a, i) => (
                      <span
                        key={`${a.tool}-${i}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          a.ok
                            ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                            : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                        }`}
                      >
                        {a.ok ? 'Done' : 'Failed'}: {a.tool.replace(/_/g, ' ')}
                        {a.ok && a.link ? (
                          <Link to={a.link} className="underline underline-offset-2">
                            open
                          </Link>
                        ) : null}
                      </span>
                    ))}
                    {(m.actions[0]?.data?.protocols || []).slice(0, 5).map((p) => (
                      <Link
                        key={p.id}
                        to={p.link}
                        className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700 ring-1 ring-slate-200 hover:bg-teal-50 hover:text-teal-900"
                      >
                        {p.title.slice(0, 40)}
                        {p.title.length > 40 ? '…' : ''}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-slate-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 focus-within:border-teal-400">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={2}
                placeholder="Ask anything, or tell me what to find/do…"
                className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {loading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="mb-0.5 rounded-lg bg-slate-200 p-2 text-slate-700"
                  aria-label="Stop"
                >
                  <StopIcon className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="mb-0.5 rounded-lg bg-teal-800 p-2 text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default ContextualResearchCopilot;
