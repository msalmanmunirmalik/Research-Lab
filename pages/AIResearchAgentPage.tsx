/**
 * AI Research Agent — research workbench grounded in DRM workflows.
 * Chat stays simple; modes + starters steer people toward literature, writing,
 * experiment design, analysis, and funding—not a generic chatbot.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, PagePanel, PageStat } from '../components/PageHeader';
import {
  SparklesIcon,
  ArrowUpIcon,
  StopIcon,
  SettingsIcon,
  DocumentTextIcon,
  MicroscopeIcon,
  LightBulbIcon,
  ClipboardDocumentListIcon,
  BookOpenIcon,
  ArrowPathIcon,
} from '../components/icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  apiUsed?: string;
}

interface ApiKey {
  id: string;
  provider: string;
  provider_name: string;
  is_active: boolean;
}

type AiAccessStatus = {
  platformConfigured: boolean;
  platformProvider: string | null;
  hasUserKeys: boolean;
  userKeyCount: number;
  quota: { limit: number; used: number; remaining: number; allowed: boolean };
  canUsePlatform: boolean;
  canUseAi: boolean;
  message: string;
};

type AgentMode = 'discover' | 'write' | 'design' | 'analyze' | 'fund';

type Starter = {
  id: string;
  title: string;
  prompt: string;
  hint: string;
};

const MODES: {
  id: AgentMode;
  label: string;
  blurb: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  accent: string;
  link?: { to: string; label: string };
  starters: Starter[];
}[] = [
  {
    id: 'discover',
    label: 'Discover',
    blurb: 'Literature, papers, and open questions in your field',
    icon: BookOpenIcon,
    accent: 'sky',
    link: { to: '/current-trends', label: 'Community news' },
    starters: [
      {
        id: 'papers',
        title: 'Find key papers',
        prompt:
          'Find recent and foundational papers on my research topic. Summarize why each matters and suggest what to read first.',
        hint: 'Curated reading list',
      },
      {
        id: 'gaps',
        title: 'Spot research gaps',
        prompt:
          'Based on my profile and field, suggest under-explored questions and why they matter scientifically.',
        hint: 'Idea space map',
      },
      {
        id: 'review',
        title: 'Outline a lit review',
        prompt:
          'Create a structured literature review outline for my topic, with section headings and what each section should cover.',
        hint: 'Section-by-section plan',
      },
    ],
  },
  {
    id: 'write',
    label: 'Write',
    blurb: 'Abstracts, methods drafts, and paper scaffolding',
    icon: DocumentTextIcon,
    accent: 'teal',
    link: { to: '/lab-notebook', label: 'Open notebook' },
    starters: [
      {
        id: 'abstract',
        title: 'Draft an abstract',
        prompt:
          'Help me write a concise scientific abstract. Ask for missing background, methods, results, and conclusions if needed.',
        hint: 'IMRaD-ready',
      },
      {
        id: 'methods',
        title: 'Methods narrative',
        prompt:
          'Turn my experimental notes into a clear Methods section suitable for a manuscript, noting what details are still missing.',
        hint: 'From notes → prose',
      },
      {
        id: 'paper',
        title: 'Paper outline from data',
        prompt:
          'Propose a paper outline from my experimental work: title options, figures plan, and claims I should (and should not) make.',
        hint: 'Claims + figures first',
      },
    ],
  },
  {
    id: 'design',
    label: 'Design',
    blurb: 'Experiments, protocols, and control logic',
    icon: MicroscopeIcon,
    accent: 'emerald',
    link: { to: '/protocols', label: 'Protocol library' },
    starters: [
      {
        id: 'experiment',
        title: 'Design an experiment',
        prompt:
          'Help me design an experiment for my research question. Include hypothesis, variables, controls, replicates, and success criteria.',
        hint: 'Controls & replicates',
      },
      {
        id: 'protocol',
        title: 'Protocol checklist',
        prompt:
          'Draft a step-by-step protocol checklist for my assay, including reagents, timing, and common failure points.',
        hint: 'Lab-ready steps',
      },
      {
        id: 'troubleshoot',
        title: 'Troubleshoot a failure',
        prompt:
          'My experiment failed. Help me systematically troubleshoot: likely causes, what to check first, and what to change next run.',
        hint: 'Next-run plan',
      },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    blurb: 'Interpret results, figures, and evidence packs',
    icon: LightBulbIcon,
    accent: 'amber',
    link: { to: '/data-results', label: 'Data & Results' },
    starters: [
      {
        id: 'interpret',
        title: 'Interpret results',
        prompt:
          'Help me interpret experimental results. Ask for the design, what I measured, and what I expected—then suggest claims and caveats.',
        hint: 'Claims with caveats',
      },
      {
        id: 'xy',
        title: 'Standard curve advice',
        prompt:
          'Explain how to analyze an XY standard curve with replicates: mean ± SD, linear regression on means, R², and QC flags to watch.',
        hint: 'Mean-based regression',
      },
      {
        id: 'negative',
        title: 'Frame a null result',
        prompt:
          'Help me document a failed or negative result so others can learn from it: what we tried, what failed, and what we would do differently.',
        hint: 'Transparency credit',
      },
    ],
  },
  {
    id: 'fund',
    label: 'Fund',
    blurb: 'Proposals, aims, and grant-ready framing',
    icon: ClipboardDocumentListIcon,
    accent: 'orange',
    link: { to: '/grants-fundings', label: 'Grants & funding' },
    starters: [
      {
        id: 'aims',
        title: 'Specific aims draft',
        prompt:
          'Draft 2–3 specific aims for my project with rationale, approach, and expected outcomes—tight enough for a grant page.',
        hint: 'Aims page tone',
      },
      {
        id: 'proposal',
        title: 'Proposal scaffold',
        prompt:
          'Outline a research proposal: significance, innovation, approach, timeline, and risks. Ask clarifying questions first if needed.',
        hint: 'Full scaffold',
      },
      {
        id: 'match',
        title: 'Pitch for a call',
        prompt:
          'Help me pitch my project to a funding call: one-paragraph fit statement and what evidence I should attach from my lab work.',
        hint: 'Call-fit statement',
      },
    ],
  },
];

function formatAgentResult(content: any, agentType: string): string {
  if (typeof content === 'string') return content;
  switch (agentType) {
    case 'paper_finding':
      if (content.papers) {
        return `Found ${content.papers.length} papers:\n\n${content.papers
          .map(
            (p: any, i: number) =>
              `${i + 1}. ${p.title}\n   ${p.authors?.join(', ')}\n   Relevance: ${(p.relevanceScore * 100).toFixed(0)}%`
          )
          .join('\n\n')}`;
      }
      break;
    case 'abstract_writing':
      if (content.abstract) {
        return `Abstract:\n\n${content.abstract}\n\nWord count: ${content.wordCount || 'N/A'}`;
      }
      break;
    case 'idea_generation':
      if (content.ideas) {
        return `Generated ${content.ideas.length} research ideas:\n\n${content.ideas
          .map(
            (idea: any, i: number) =>
              `${i + 1}. ${idea.title}\n   ${idea.description}\n   Feasibility: ${idea.feasibility} | Impact: ${idea.potentialImpact}`
          )
          .join('\n\n')}`;
      }
      break;
  }
  return JSON.stringify(content, null, 2);
}

function formatWorkflowResult(result: any): string {
  if (result.tasks) {
    return `Workflow finished (${result.tasks.length} steps):\n\n${result.tasks
      .map((task: any, i: number) => `${i + 1}. ${task.task}: ${task.success ? 'ok' : 'failed'}`)
      .join('\n')}`;
  }
  return JSON.stringify(result, null, 2);
}

/** Lightweight formatting for assistant text (bold + paragraphs). */
function MessageBody({ text, streaming }: { text: string; streaming?: boolean }) {
  if (!text && streaming) {
    return (
      <div className="flex items-center gap-1.5 text-slate-400 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse [animation-delay:300ms]" />
        <span className="ml-1 text-[12px]">Thinking…</span>
      </div>
    );
  }

  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
      {streaming && text ? (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-sky-600 align-middle" />
      ) : null}
    </div>
  );
}

const AIResearchAgentPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [aiAccess, setAiAccess] = useState<AiAccessStatus | null>(null);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [mode, setMode] = useState<AgentMode>('discover');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeMode = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);
  const ModeIcon = activeMode.icon;
  const hasConversation = messages.length > 0;
  const activeKeys = apiKeys.filter((k) => k.is_active);
  const canUseAi = aiAccess?.canUseAi ?? activeKeys.length > 0;

  const checkApiSetup = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [keysResponse, accessResponse] = await Promise.all([
        axios.get('/api/api-task-assignments/api-keys', { headers }).catch(() => null),
        axios.get('/api/ai-research-agent/access', { headers }).catch(() => null),
      ]);
      setApiKeys(keysResponse?.data?.apiKeys || []);
      if (accessResponse?.data) setAiAccess(accessResponse.data);
    } catch (error) {
      console.error('Error checking API setup:', error);
    } finally {
      setIsCheckingSetup(false);
    }
  }, []);

  useEffect(() => {
    void checkApiSetup();
  }, [checkApiSetup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const sendChat = async (raw: string) => {
    const content = raw.trim();
    if (!content || isLoading || isExecutingWorkflow) return;

    if (!canUseAi) {
      if (aiAccess && !aiAccess.quota.allowed && !aiAccess.hasUserKeys) {
        // Quota exhausted — send anyway so server returns the clear message, or navigate
        navigate('/settings?tab=api-management');
        return;
      }
      if (!aiAccess?.platformConfigured && activeKeys.length === 0) {
        navigate('/settings?tab=api-management');
        return;
      }
    }

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    const assistantMessageId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please log in to use the AI Research Agent');

      const modeHint = `User selected research mode: ${activeMode.label} — ${activeMode.blurb}`;
      const response = await axios.post(
        '/api/ai-research-agent/chat',
        {
          message: content,
          conversation_history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          pageContext: modeHint,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: abortControllerRef.current.signal,
        }
      );

      const reply =
        response.data?.content ||
        response.data?.message ||
        'I received your message but returned an empty response.';
      const apiUsed = response.data?.apiUsed || response.data?.provider || null;
      if (response.data?.access) setAiAccess(response.data.access);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: reply, isStreaming: false, apiUsed }
            : msg
        )
      );
      void checkApiSetup();
    } catch (error: any) {
      if (axios.isCancel(error)) {
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
        return;
      }

      const errorMessage =
        error.response?.data?.error || error.message || 'Sorry, something went wrong.';
      const isMissingAssignment =
        errorMessage.toLowerCase().includes('assigned') ||
        errorMessage.toLowerCase().includes('assignment') ||
        errorMessage.toLowerCase().includes('api key');

      let errorContent = errorMessage;
      if (isMissingAssignment) {
        errorContent +=
          '\n\n**Quick fix:** open Settings → API keys to connect your own provider, or ask an admin to set GEMINI_API_KEY on the server.';
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: errorContent, isStreaming: false }
            : msg
        )
      );
      void checkApiSetup();
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setIsLoading(false);
  };

  const handleNewChat = () => {
    if (isLoading) handleStop();
    setMessages([]);
    setInput('');
  };

  const handleWorkflowClick = async (workflowType: string, payload?: Record<string, unknown>) => {
    if (isLoading || isExecutingWorkflow) return;
    if (!canUseAi) {
      navigate('/settings?tab=api-management');
      return;
    }

    setIsExecutingWorkflow(true);
    setIsLoading(true);

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content:
        workflowType === 'paper-generation'
          ? 'Run the paper-generation workflow from my research context.'
          : 'Run the experiment-design workflow from my research question.',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const assistantMessageId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/orchestrator/execute/${workflowType}`,
        { input: payload || {} },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const result = response.data.result || response.data;
        let content = `**${workflowType.replace(/-/g, ' ')}** finished.\n\n`;
        if (result.content) content += formatAgentResult(result.content, workflowType);
        else if (result.synthesizedResult) content += formatWorkflowResult(result.synthesizedResult);
        else content += JSON.stringify(result, null, 2);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content, isStreaming: false } : msg
          )
        );
      } else {
        throw new Error(response.data.error || 'Workflow execution failed');
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || 'Failed to execute workflow';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: errorMessage, isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setIsExecutingWorkflow(false);
    }
  };

  return (
    <div className={`mx-auto flex max-w-6xl flex-col gap-5 ${embedded ? 'px-4 py-4 sm:px-6' : 'pb-6'}`}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 flex-1 min-w-0">
            <PageStat label="Mode" value={activeMode.label} accent="sky" />
            <PageStat
              label="AI access"
              value={
                isCheckingSetup
                  ? '…'
                  : aiAccess?.hasUserKeys
                    ? 'Your keys'
                    : aiAccess?.platformConfigured
                      ? 'Included'
                      : 'Needed'
              }
              accent={canUseAi ? 'emerald' : 'orange'}
            />
            <PageStat
              label="Free today"
              value={isCheckingSetup ? '…' : aiAccess ? `${aiAccess.quota.remaining}` : '—'}
              accent={aiAccess && !aiAccess.quota.allowed ? 'orange' : 'teal'}
            />
            <PageStat
              label="Status"
              value={isLoading ? 'Working' : canUseAi ? 'Ready' : 'Limited'}
              accent={isLoading ? 'amber' : canUseAi ? 'sky' : 'orange'}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasConversation ? (
              <button
                type="button"
                onClick={handleNewChat}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowPathIcon className="h-4 w-4" />
                New chat
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/settings?tab=api-management')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <SettingsIcon className="h-4 w-4" />
              API keys
            </button>
          </div>
        </div>
      ) : (
        <PageHeader
          title="Research agent"
          subtitle="A workbench for literature, writing, experiment design, analysis, and funding — grounded in how you already work in RILOS."
          accent="sky"
          icon={<SparklesIcon />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {hasConversation ? (
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  New chat
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('/settings?tab=api-management')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <SettingsIcon className="h-4 w-4" />
                API keys
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PageStat label="Mode" value={activeMode.label} accent="sky" />
            <PageStat
              label="AI access"
              value={
                isCheckingSetup
                  ? '…'
                  : aiAccess?.hasUserKeys
                    ? 'Your keys'
                    : aiAccess?.platformConfigured
                      ? 'Included'
                      : 'Needed'
              }
              accent={canUseAi ? 'emerald' : 'orange'}
              action={
                !isCheckingSetup && aiAccess?.canUsePlatform && !aiAccess.hasUserKeys ? (
                  <span className="text-[11px] text-slate-500">
                    {aiAccess.quota.remaining}/{aiAccess.quota.limit}
                  </span>
                ) : null
              }
            />
            <PageStat
              label="Free today"
              value={isCheckingSetup ? '…' : aiAccess ? `${aiAccess.quota.remaining}` : '—'}
              accent={aiAccess && !aiAccess.quota.allowed ? 'orange' : 'teal'}
            />
            <PageStat
              label="Status"
              value={isLoading ? 'Working' : canUseAi ? 'Ready' : 'Limited'}
              accent={isLoading ? 'amber' : canUseAi ? 'sky' : 'orange'}
            />
          </div>
        </PageHeader>
      )}

      {!isCheckingSetup && aiAccess?.message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] ${
            canUseAi
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
              : 'border-amber-200 bg-amber-50/80 text-amber-950'
          }`}
        >
          {aiAccess.message}{' '}
          {!canUseAi || (aiAccess.platformConfigured && !aiAccess.hasUserKeys) ? (
            <button
              type="button"
              onClick={() => navigate('/settings?tab=api-management')}
              className="font-semibold underline-offset-2 hover:underline"
            >
              {canUseAi ? 'Add your own key (optional)' : 'Connect your API key'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Mode rail */}
        <aside className="lg:col-span-3 space-y-3 lg:sticky lg:top-4">
          <PagePanel accent="sky" className="p-2 sm:p-2" title="Focus">
            <nav className="space-y-0.5" aria-label="Agent modes">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'bg-sky-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-sky-100' : 'text-slate-400'}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{m.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-snug ${
                          active ? 'text-sky-100/90' : 'text-slate-500'
                        }`}
                      >
                        {m.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </PagePanel>

          {activeMode.link ? (
            <PagePanel accent="teal" title="In the app">
              <p className="text-[12px] text-slate-500 mb-2">
                Pair the agent with the workspace where this work already lives.
              </p>
              <Link
                to={activeMode.link.to}
                className="inline-flex text-[13px] font-medium text-sky-800 hover:text-sky-950"
              >
                {activeMode.link.label} →
              </Link>
            </PagePanel>
          ) : null}

          {(mode === 'write' || mode === 'design') && (
            <PagePanel accent="amber" title="Longer runs">
              <p className="text-[12px] text-slate-500 mb-3">
                Multi-step orchestrations when a single chat turn is not enough.
              </p>
              <div className="space-y-2">
                {mode === 'write' ? (
                  <button
                    type="button"
                    disabled={isLoading || isExecutingWorkflow}
                    onClick={() =>
                      void handleWorkflowClick('paper-generation', {
                        researchQuestion: 'Research question',
                        data: {},
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[12px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Paper generation workflow
                  </button>
                ) : null}
                {mode === 'design' ? (
                  <button
                    type="button"
                    disabled={isLoading || isExecutingWorkflow}
                    onClick={() =>
                      void handleWorkflowClick('experiment', {
                        researchQuestion: 'Research question',
                        constraints: {},
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[12px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Experiment workflow
                  </button>
                ) : null}
              </div>
            </PagePanel>
          )}
        </aside>

        {/* Chat column */}
        <div className="lg:col-span-9 flex min-h-[70vh] flex-col">
          <PagePanel
            accent="sky"
            className="flex flex-1 flex-col !p-0 overflow-hidden"
            title={
              <span className="inline-flex items-center gap-2">
                <ModeIcon className="h-4 w-4 text-sky-700" />
                {activeMode.label}
              </span>
            }
            action={
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {user?.first_name
                  ? `Working with ${user.first_name}`
                  : 'Ask in plain language'}
              </span>
            }
          >
            <div className="flex flex-1 flex-col min-h-[28rem]">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 max-h-[min(58vh,640px)]">
                {!hasConversation ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-dashed border-sky-200 bg-gradient-to-br from-sky-50/70 to-white px-4 py-5">
                      <p className="text-[14px] font-semibold text-slate-900">
                        Start from a research job — not a blank chat
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
                        Pick a starter below, or type your own. The agent uses your configured
                        providers and can lean on context from your lab work.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {activeMode.starters.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isLoading}
                          onClick={() => void sendChat(s.prompt)}
                          className="group rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50/40 disabled:opacity-50"
                        >
                          <p className="text-[13px] font-semibold text-slate-900 group-hover:text-sky-950">
                            {s.title}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">{s.hint}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' ? (
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sm shadow-sky-200/50">
                          <SparklesIcon className="h-4 w-4" />
                        </div>
                      ) : null}
                      <div
                        className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-sky-700 text-white shadow-sm'
                            : 'border border-slate-200/80 bg-slate-50/80 text-slate-900'
                        }`}
                      >
                        <MessageBody
                          text={message.content}
                          streaming={message.isStreaming}
                        />
                        {message.role === 'assistant' &&
                        message.apiUsed &&
                        !message.isStreaming ? (
                          <p className="mt-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-500">
                            Via {message.apiUsed}
                          </p>
                        ) : null}
                      </div>
                      {message.role === 'user' ? (
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-[11px] font-semibold text-slate-700">
                          {user?.first_name?.[0] || user?.email?.[0] || 'U'}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-slate-100 bg-white/90 px-4 py-3 sm:px-5">
                {!hasConversation ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {activeMode.starters.map((s) => (
                      <button
                        key={`chip-${s.id}`}
                        type="button"
                        onClick={() => setInput(s.prompt)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900"
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                ) : null}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendChat(input);
                  }}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 rounded-xl border border-slate-200 bg-white focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/30">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendChat(input);
                        }
                      }}
                      placeholder={`Ask about ${activeMode.label.toLowerCase()}…`}
                      rows={1}
                      disabled={isLoading}
                      className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
                      style={{ minHeight: 42, maxHeight: 180 }}
                    />
                  </div>
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100"
                      title="Stop"
                    >
                      <StopIcon className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Send"
                    >
                      <ArrowUpIcon className="h-5 w-5" />
                    </button>
                  )}
                </form>
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Enter to send · Shift+Enter for a new line · Mode shapes the starter prompts
                </p>
              </div>
            </div>
          </PagePanel>
        </div>
      </div>
    </div>
  );
};

export default AIResearchAgentPage;
