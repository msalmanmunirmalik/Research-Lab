import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  experimentService,
  Experiment,
  UpdateExperimentData,
} from '../services/experimentService';
import { resultWorkspaceUrl, writingFromEvidenceUrl } from '../utils/evidenceChain';
import { getAuthHeaders } from '../utils/apiBase';
import { ArrowLeftIcon, BeakerIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';

type WorkspaceTab = 'overview' | 'method' | 'findings' | 'next';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'method', label: 'Method' },
  { id: 'findings', label: 'Findings' },
  { id: 'next', label: 'Next' },
];

const EXP_STATUSES = [
  'planning',
  'ready',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;

type EvidenceRow = {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  results?: string;
  created_at?: string;
  createdAt?: string;
};

type ProtocolOption = { id: string; title: string };

type Draft = {
  title: string;
  aim: string;
  status: string;
  protocolId: string;
  methodNotes: string;
  findings: string;
  conclusions: string;
  nextSteps: string;
};

const emptyDraft = (): Draft => ({
  title: '',
  aim: '',
  status: 'planning',
  protocolId: '',
  methodNotes: '',
  findings: '',
  conclusions: '',
  nextSteps: '',
});

function draftFromExperiment(exp: Experiment): Draft {
  return {
    title: exp.title || '',
    aim: exp.hypothesis || '',
    status: exp.status || 'planning',
    protocolId: exp.protocolId || '',
    methodNotes: exp.methodology || '',
    findings: exp.results || exp.description || '',
    conclusions: exp.conclusions || '',
    nextSteps: exp.nextSteps || '',
  };
}

function formatWhen(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-400';
const areaClass = `${fieldClass} resize-y min-h-[140px] leading-relaxed`;
const labelClass = 'block text-[12px] font-medium text-slate-600 mb-1.5';

const ExperimentWorkspacePage: React.FC = () => {
  const { experimentId = '' } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab: WorkspaceTab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'overview';

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [protocols, setProtocols] = useState<ProtocolOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [newProtocolTitle, setNewProtocolTitle] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [addingResult, setAddingResult] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isDirty = JSON.stringify(draft) !== baseline;

  const setTab = (tab: WorkspaceTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'overview') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  const loadAll = useCallback(async () => {
    if (!experimentId) return;
    setLoading(true);
    setError('');
    try {
      const exp = await experimentService.getExperiment(experimentId);
      setExperiment(exp);
      const d = draftFromExperiment(exp);
      setDraft(d);
      setBaseline(JSON.stringify(d));
      setSaveState('idle');

      try {
        const { data } = await axios.get('/api/data-results', {
          headers: getAuthHeaders(),
          params: { experiment_id: experimentId },
        });
        setEvidence(Array.isArray(data?.results) ? data.results : []);
      } catch {
        setEvidence([]);
      }

      try {
        const { data } = await axios.get('/api/protocols', {
          headers: getAuthHeaders(),
          params: { limit: 100 },
        });
        const list = Array.isArray(data?.protocols)
          ? data.protocols
          : Array.isArray(data)
            ? data
            : [];
        setProtocols(
          list
            .filter((p: any) => p?.id)
            .map((p: any) => ({
              id: String(p.id),
              title: String(p.title || 'Untitled'),
            }))
        );
      } catch {
        setProtocols([]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load experiment');
      setExperiment(null);
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const persist = useCallback(async () => {
    if (!experiment) return;
    const current = draftRef.current;
    const snap = JSON.stringify(current);
    if (snap === baseline) return;

    setSaveState('saving');
    setError('');
    try {
      const payload: UpdateExperimentData = {
        title: current.title.trim() || experiment.title,
        hypothesis: current.aim,
        status: current.status as Experiment['status'],
        protocolId: current.protocolId || undefined,
        methodology: current.methodNotes,
        results: current.findings,
        description: current.findings,
        conclusions: current.conclusions,
        nextSteps: current.nextSteps,
      };
      const updated = await experimentService.updateExperiment(experiment.id, payload);
      setExperiment({ ...experiment, ...updated });
      setBaseline(snap);
      setSaveState('saved');
      window.setTimeout(() => {
        setSaveState((s) => (s === 'saved' ? 'idle' : s));
      }, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save');
      setSaveState('dirty');
    }
  }, [experiment, baseline]);

  useEffect(() => {
    if (!experiment || !isDirty) return;
    setSaveState('dirty');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist();
    }, 900);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, experiment, isDirty, persist]);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const createQuickProtocol = async () => {
    const t = newProtocolTitle.trim();
    if (!t || !experiment) return;
    setError('');
    try {
      const { data } = await axios.post(
        '/api/protocols',
        {
          title: t,
          description: 'Created from experiment',
          category: 'other',
          difficulty_level: 'intermediate',
          estimated_duration: 60,
          materials: [],
          content: 'Add steps in Methods.',
          safety_notes: '',
          tags: [],
          privacy_level: 'lab',
          version: '1.0',
        },
        { headers: getAuthHeaders() }
      );
      const saved = data?.protocol || data;
      const id = String(saved?.id || '');
      if (!id) throw new Error('No protocol id');
      setProtocols((prev) => [{ id, title: t }, ...prev.filter((p) => p.id !== id)]);
      patch('protocolId', id);
      setNewProtocolTitle('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create protocol');
    }
  };

  const addResultNote = async () => {
    if (!experiment || !resultNote.trim()) return;
    setAddingResult(true);
    setError('');
    try {
      const { data: created } = await axios.post(
        '/api/data/results',
        {
          title: `${draft.title || experiment.title} — note`,
          summary: resultNote.trim().slice(0, 280),
          results: resultNote.trim(),
          description: resultNote.trim(),
          experiment_id: experiment.id,
          protocol_id: draft.protocolId || experiment.protocolId || undefined,
          type: 'experiment',
          category: 'other',
          status: 'draft',
          privacy_level: 'lab',
          lab_id: experiment.labId || undefined,
        },
        { headers: getAuthHeaders() }
      );
      setResultNote('');
      const newId = String(created?.id || created?.result?.id || '');
      if (newId) {
        navigate(
          resultWorkspaceUrl({
            resultId: newId,
            experimentId: experiment.id,
          })
        );
        return;
      }
      const { data } = await axios.get('/api/data-results', {
        headers: getAuthHeaders(),
        params: { experiment_id: experiment.id },
      });
      setEvidence(Array.isArray(data?.results) ? data.results : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not add result note');
    } finally {
      setAddingResult(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center text-[13px] text-slate-500">
        Opening experiment…
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center">
        <p className="text-[15px] font-medium text-slate-900 mb-2">{error || 'Experiment not found'}</p>
        <Link to="/experiment-tracker" className="text-[13px] text-orange-700 hover:underline">
          Back to experiments
        </Link>
      </div>
    );
  }

  const linked = protocols.find((p) => p.id === draft.protocolId);
  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'dirty'
          ? 'Unsaved'
          : 'Up to date';

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <div className="mb-4">
        <Link
          to="/experiment-tracker"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          All experiments
        </Link>
      </div>

      <PageHeader
        title={draft.title || experiment.title}
        accent="orange"
        icon={<BeakerIcon />}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-700"
              value={draft.status}
              onChange={(e) => patch('status', e.target.value)}
              aria-label="Status"
            >
              {EXP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
            <span className="text-slate-500">
              {evidence.length} result note{evidence.length === 1 ? '' : 's'}
            </span>
            <span
              className={`text-[12px] font-medium ${
                isDirty ? 'text-orange-700' : 'text-slate-400'
              }`}
            >
              {saveLabel}
            </span>
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saveState === 'saving' || !isDirty}
            className="inline-flex items-center px-3.5 py-2 text-[13px] font-medium text-white bg-orange-700 rounded-md hover:bg-orange-800 disabled:opacity-40"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save now'}
          </button>
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <nav
        className="mt-6 flex gap-1 border-b border-slate-200 overflow-x-auto"
        aria-label="Experiment sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.id === 'findings' && evidence.length > 0 && (
              <span className="ml-1.5 text-[11px] text-slate-400">{evidence.length}</span>
            )}
            {activeTab === tab.id && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-orange-600 rounded-full" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className={labelClass} htmlFor="exp-title">
                  Title
                </label>
                <input
                  id="exp-title"
                  className={fieldClass}
                  value={draft.title}
                  onChange={(e) => patch('title', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="exp-aim">
                  Aim / hypothesis
                </label>
                <textarea
                  id="exp-aim"
                  className={areaClass}
                  value={draft.aim}
                  onChange={(e) => patch('aim', e.target.value)}
                  placeholder="What question are you answering?"
                  rows={8}
                />
              </div>
            </div>
            <aside className="space-y-4 lg:pt-6">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Snapshot
                </p>
                <dl className="space-y-3 text-[13px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Method</dt>
                    <dd className="text-right text-slate-900 font-medium line-clamp-2">
                      {linked?.title || 'Not linked'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Findings</dt>
                    <dd className="text-right text-slate-900 font-medium">
                      {draft.findings.trim() ? 'In progress' : 'Empty'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Result notes</dt>
                    <dd className="text-right text-slate-900 font-medium tabular-nums">
                      {evidence.length}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
                  <button
                    type="button"
                    className="font-medium text-orange-800 hover:underline"
                    onClick={() => setTab('method')}
                  >
                    Edit method →
                  </button>
                  <button
                    type="button"
                    className="font-medium text-orange-800 hover:underline"
                    onClick={() => setTab('findings')}
                  >
                    Edit findings →
                  </button>
                </div>
              </div>
              <p className="text-[12px] text-slate-400 px-1">Changes save automatically.</p>
            </aside>
          </div>
        )}

        {activeTab === 'method' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className={labelClass} htmlFor="exp-protocol">
                  Protocol
                </label>
                <select
                  id="exp-protocol"
                  className={fieldClass}
                  value={draft.protocolId}
                  onChange={(e) => patch('protocolId', e.target.value)}
                >
                  <option value="">Choose from library…</option>
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                {linked && (
                  <p className="mt-2 text-[12px] text-slate-500">
                    <Link
                      to={`/experiment-tracker?tab=protocols&protocolId=${encodeURIComponent(linked.id)}`}
                      className="font-medium text-slate-800 underline-offset-2 hover:underline"
                    >
                      Open {linked.title} in Methods
                    </Link>
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  className={fieldClass}
                  value={newProtocolTitle}
                  onChange={(e) => setNewProtocolTitle(e.target.value)}
                  placeholder="Or name a new protocol"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void createQuickProtocol();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!newProtocolTitle.trim()}
                  onClick={() => void createQuickProtocol()}
                  className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="method-notes">
                How you ran it
              </label>
              <textarea
                id="method-notes"
                className={`${areaClass} min-h-[220px]`}
                value={draft.methodNotes}
                onChange={(e) => patch('methodNotes', e.target.value)}
                placeholder="Deviations, conditions, reagents, setup…"
                rows={10}
              />
            </div>
          </div>
        )}

        {activeTab === 'findings' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className={labelClass} htmlFor="findings">
                  Observations
                </label>
                <textarea
                  id="findings"
                  className={`${areaClass} min-h-[200px]`}
                  value={draft.findings}
                  onChange={(e) => patch('findings', e.target.value)}
                  placeholder="Numbers, bands, readings, surprises…"
                  rows={9}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="conclusions">
                  Takeaway
                </label>
                <textarea
                  id="conclusions"
                  className={areaClass}
                  value={draft.conclusions}
                  onChange={(e) => patch('conclusions', e.target.value)}
                  placeholder="What does this mean for your aim?"
                  rows={5}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Attached result notes</label>
              <div className="flex gap-2 mb-4">
                <input
                  className={fieldClass}
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                  placeholder="Quick note to attach"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addResultNote();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={addingResult || !resultNote.trim()}
                  onClick={() => void addResultNote()}
                  className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {addingResult ? '…' : 'Attach'}
                </button>
              </div>
              {evidence.length === 0 ? (
                <p className="text-[13px] text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl">
                  No attached notes yet
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                  {evidence.map((row) => (
                    <li key={row.id}>
                      <Link
                        to={resultWorkspaceUrl({
                          resultId: row.id,
                          experimentId: experiment.id,
                        })}
                        className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                      >
                        <span className="text-[14px] text-slate-900">{row.title}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatWhen(row.created_at || row.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'next' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <label className={labelClass} htmlFor="next-steps">
                Follow-ups
              </label>
              <textarea
                id="next-steps"
                className={`${areaClass} min-h-[200px]`}
                value={draft.nextSteps}
                onChange={(e) => patch('nextSteps', e.target.value)}
                placeholder="Repeats, analyses to run, questions left open…"
                rows={9}
              />
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-6 space-y-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Continue the pipeline
              </p>
              <div className="flex flex-col gap-3 text-[14px]">
                <Link
                  to={`/data-analysis?experimentId=${encodeURIComponent(experiment.id)}`}
                  className="font-medium text-slate-800 underline-offset-4 hover:underline"
                >
                  Open in Analysis →
                </Link>
                <Link
                  to={writingFromEvidenceUrl({
                    evidenceId: evidence[0]?.id,
                    title: draft.title || experiment.title,
                  })}
                  className="font-medium text-slate-800 underline-offset-4 hover:underline"
                >
                  Continue in Writing Studio →
                </Link>
                <Link
                  to="/data-results"
                  className="font-medium text-slate-800 underline-offset-4 hover:underline"
                >
                  Browse all results →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExperimentWorkspacePage;
