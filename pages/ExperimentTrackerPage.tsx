import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ExperimentForm from '../components/ExperimentForm';
import ProtocolsPageRefactored from './ProtocolsPageRefactored';
import {
  experimentService,
  Experiment,
  CreateExperimentData,
  ExperimentAnalytics,
} from '../services/experimentService';
import { useEntityDeepLink } from '../hooks/useEntityDeepLink';
import { evidenceFromRecordUrl } from '../utils/evidenceChain';
import {
  BeakerIcon,
  PlusIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
  TrashIcon,
  PlayIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  BookOpenIcon,
  FunnelIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';

interface ExperimentTrackerPageProps {
  embedded?: boolean;
}

type MainTab = 'runs' | 'protocols';

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'planning', label: 'Planning' },
  { id: 'running', label: 'Running' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

const ExperimentTrackerPage = ({ embedded = false }: ExperimentTrackerPageProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainTab: MainTab = searchParams.get('tab') === 'protocols' ? 'protocols' : 'runs';

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [analytics, setAnalytics] = useState<ExperimentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [showNewExperimentModal, setShowNewExperimentModal] = useState(false);
  const [linkedProtocolId, setLinkedProtocolId] = useState<string>('');
  const [methodNote, setMethodNote] = useState('');
  const [prefillTitle, setPrefillTitle] = useState<string>('');

  const setMainTab = (tab: MainTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'protocols') next.set('tab', 'protocols');
        else {
          next.delete('tab');
          next.delete('protocolId');
        }
        return next;
      },
      { replace: true }
    );
  };

  const openExperimentWorkspace = useCallback(
    (experiment: Experiment) => {
      navigate(`/experiments/${encodeURIComponent(experiment.id)}`);
    },
    [navigate]
  );
  const { focusedId } = useEntityDeepLink(experiments, openExperimentWorkspace);

  useEffect(() => {
    loadExperiments();
    loadAnalytics();
  }, []);

  useEffect(() => {
    const startRun = searchParams.get('startRun') === '1';
    const protocolId = searchParams.get('protocolId');
    const title = searchParams.get('title');
    const methodDoi = searchParams.get('methodDoi');
    const methodUrl = searchParams.get('methodUrl');
    const isHandoff = startRun || Boolean(title || methodDoi || methodUrl);
    if (!isHandoff) return;

    if (protocolId) setLinkedProtocolId(protocolId);
    if (title) setPrefillTitle(title);
    if (methodDoi || methodUrl) {
      setMethodNote(
        `SpringerProtocols metadata only. DOI: ${methodDoi || 'none'}. ${methodUrl || ''} The full protocol is not stored in RILOS.`
      );
    }
    setShowNewExperimentModal(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('startRun');
        next.delete('protocolId');
        next.delete('title');
        next.delete('methodDoi');
        next.delete('methodUrl');
        next.delete('tab');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  const mapFormToCreateData = (data: Record<string, any>): CreateExperimentData => {
    const protocolId = data.protocolId || linkedProtocolId || undefined;
    const started =
      data.startDate && data.startTime
        ? `Started: ${data.startDate} ${data.startTime}`
        : data.startDate
          ? `Started: ${data.startDate}`
          : '';
    const noteParts = [
      started,
      protocolId ? `Linked protocol: ${protocolId}` : '',
      data.protocolModifications ? `Modifications: ${data.protocolModifications}` : '',
      methodNote,
    ].filter(Boolean);

    const findings = data.findings ?? data.description ?? data.resultsLink ?? '';

    return {
      title: data.title || prefillTitle || 'Untitled experiment',
      description: findings,
      hypothesis: data.hypothesis || data.objective || '',
      objectives: Array.isArray(data.objectives) ? data.objectives : [],
      methodology: data.methodology || data.protocolModifications || data.modifications || '',
      expectedOutcomes: Array.isArray(data.expectedOutcomes) ? data.expectedOutcomes : [],
      priority: data.priority || 'medium',
      category: (data.category || 'other') as CreateExperimentData['category'],
      estimatedDuration: data.estimatedDuration || 0,
      dueDate: data.dueDate,
      labId: data.labId || user?.lab_id || undefined,
      collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
      equipment: Array.isArray(data.equipment) ? data.equipment : [],
      materials: Array.isArray(data.materials) ? data.materials : [],
      reagents: Array.isArray(data.reagents) ? data.reagents : [],
      safetyRequirements: Array.isArray(data.safetyRequirements) ? data.safetyRequirements : [],
      budget: data.budget || 0,
      tags: Array.isArray(data.tags) ? data.tags : protocolId ? [`protocol:${protocolId}`] : [],
      notes: noteParts.join('\n'),
      templateId: data.templateId,
      protocolId,
      milestones: Array.isArray(data.milestones) ? data.milestones : [],
      risks: Array.isArray(data.risks) ? data.risks : [],
    };
  };

  const loadExperiments = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await experimentService.getExperiments({});
      setExperiments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading experiments:', err);
      setError('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await experimentService.getAnalytics(30);
      setAnalytics(data);
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  const handleCreateExperiment = async (data: Record<string, unknown>) => {
    try {
      const createData = mapFormToCreateData(data);
      const newExperiment = await experimentService.createExperiment(createData);
      setExperiments((prev) => [newExperiment, ...prev]);
      setShowNewExperimentModal(false);
      setLinkedProtocolId('');
      setPrefillTitle('');
      setMethodNote('');
      await loadAnalytics();
      navigate(`/experiments/${encodeURIComponent(newExperiment.id)}`);
    } catch (err) {
      console.error('Error creating experiment:', err);
      const message = err instanceof Error ? err.message : 'Failed to create experiment';
      setError(message || 'Failed to create experiment');
    }
  };

  const handleDeleteExperiment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this experiment?')) return;
    try {
      await experimentService.deleteExperiment(id);
      setExperiments((prev) => prev.filter((exp) => exp.id !== id));
      await loadAnalytics();
    } catch (err) {
      console.error('Error deleting experiment:', err);
      setError('Failed to delete experiment');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning':
        return 'bg-sky-50 text-sky-800 border-sky-100';
      case 'ready':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'running':
        return 'bg-amber-50 text-amber-900 border-amber-100';
      case 'paused':
        return 'bg-orange-50 text-orange-900 border-orange-100';
      case 'completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'failed':
        return 'bg-red-50 text-red-800 border-red-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const sortedExperiments = useMemo(() => {
    const filtered = experiments.filter((exp) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        exp.title.toLowerCase().includes(q) ||
        exp.description.toLowerCase().includes(q) ||
        exp.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchesStatus = filterStatus === 'all' || exp.status === filterStatus;
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'priority': {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        case 'status':
          return a.status.localeCompare(b.status);
        case 'due_date':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [experiments, searchTerm, filterStatus, sortBy]);

  const filtersActive =
    searchTerm.trim().length > 0 || filterStatus !== 'all' || sortBy !== 'created_at';

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setSortBy('created_at');
  };

  const resetCreateModal = () => {
    setShowNewExperimentModal(false);
    setLinkedProtocolId('');
    setPrefillTitle('');
    setMethodNote('');
  };

  return (
    <div className={embedded ? '' : 'max-w-7xl mx-auto'}>
      {!embedded && (
        <div className="mb-6">
          <PageHeader
            title="Experiments"
            accent="orange"
            icon={<BeakerIcon />}
            subtitle={
              <>
                Design each study, link a method, and capture findings.
                Personal scratch notes stay in{' '}
                <Link
                  to="/lab-notebook"
                  className="font-medium text-slate-800 hover:text-slate-950 underline-offset-2 hover:underline"
                >
                  Notebook
                </Link>
                .
              </>
            }
            actions={
              <button
                type="button"
                onClick={() => setShowNewExperimentModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-orange-700 rounded-md hover:bg-orange-800 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                New experiment
              </button>
            }
          />
        </div>
      )}

      {embedded && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-slate-600">Plan experiments and link methods from one place.</p>
          <button
            type="button"
            onClick={() => setShowNewExperimentModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            <PlusIcon className="h-4 w-4" />
            New experiment
          </button>
        </div>
      )}

      <nav
        className="mb-6 flex gap-1 border-b border-slate-200"
        aria-label="Experiment hub sections"
      >
        {(
          [
            { id: 'runs' as const, name: 'Experiments', icon: BeakerIcon },
            { id: 'protocols' as const, name: 'Methods', icon: BookOpenIcon },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMainTab(tab.id)}
            className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
              mainTab === tab.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
            {mainTab === tab.id && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-orange-600 rounded-full" />
            )}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <ExclamationCircleIcon className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {mainTab === 'protocols' ? (
        <ProtocolsPageRefactored embedded />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: analytics?.totalExperiments ?? 0, icon: BeakerIcon },
              { label: 'Running', value: analytics?.runningExperiments ?? 0, icon: PlayIcon },
              { label: 'Completed', value: analytics?.completedExperiments ?? 0, icon: CheckCircleIcon },
              { label: 'Overdue', value: analytics?.overdueExperiments ?? 0, icon: ClockIcon },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white border border-slate-200/80 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <stat.icon className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-lg font-semibold text-slate-900 tabular-nums">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 relative min-w-0">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <Input
                  placeholder="Search by title, findings, or tags…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-[13px]"
                  aria-label="Search experiments"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="experiment-sort" className="text-[12px] font-medium text-slate-500 whitespace-nowrap">
                  Sort
                </label>
                <Select
                  id="experiment-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-[13px] min-w-[9rem]"
                >
                  <option value="created_at">Newest first</option>
                  <option value="title">Title A–Z</option>
                  <option value="status">Status</option>
                  <option value="due_date">Due date</option>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <FunnelIcon className="h-3.5 w-3.5" />
                  Status
                </span>
                {STATUS_FILTERS.map((chip) => {
                  const active = filterStatus === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setFilterStatus(chip.id)}
                      className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 text-[12px] text-slate-500">
                <span>
                  {sortedExperiments.length} of {experiments.length} experiment
                  {experiments.length === 1 ? '' : 's'}
                </span>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="font-medium text-orange-700 hover:text-orange-900 underline-offset-2 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-[13px] text-slate-500">Loading experiments…</div>
          ) : sortedExperiments.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-xl py-14 px-6 text-center">
              <BeakerIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              {experiments.length === 0 ? (
                <>
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-1">No experiments yet</h3>
                  <p className="text-[13px] text-slate-500 mb-5 max-w-md mx-auto">
                    Start with a method from the Methods tab, or create an experiment and link a protocol as you go.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setMainTab('protocols')} variant="outline">
                      Browse methods
                    </Button>
                    <Button onClick={() => setShowNewExperimentModal(true)}>
                      <PlusIcon className="h-4 w-4 mr-2" />
                      New experiment
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-1">No matching experiments</h3>
                  <p className="text-[13px] text-slate-500 mb-4">Try another status or search term.</p>
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedExperiments.map((experiment) => (
                <li
                  key={experiment.id}
                  data-entity-id={experiment.id}
                  className={`bg-white border rounded-xl p-4 transition-colors ${
                    focusedId === experiment.id
                      ? 'border-sky-400 ring-2 ring-sky-100'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                    <button
                      type="button"
                      onClick={() => openExperimentWorkspace(experiment)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-semibold text-slate-900 truncate">
                          {experiment.title}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${getStatusColor(experiment.status)}`}
                        >
                          {experiment.status.replace('_', ' ')}
                        </span>
                      </div>
                      {experiment.hypothesis && (
                        <p className="text-[13px] text-slate-600 line-clamp-2 mb-1">{experiment.hypothesis}</p>
                      )}
                      <p className="text-[12px] text-slate-500 line-clamp-1">
                        Open to edit method, findings, and next steps
                      </p>
                      {experiment.dueDate && (
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {new Date(experiment.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openExperimentWorkspace(experiment)}
                        className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] font-medium text-orange-950 hover:bg-orange-100"
                      >
                        Open
                      </button>
                      <Link
                        to={evidenceFromRecordUrl({
                          experimentId: experiment.id,
                          protocolId: experiment.protocolId,
                          title: experiment.title,
                          summary: experiment.hypothesis || experiment.description,
                        })}
                        className="hidden sm:inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-950 hover:bg-emerald-100"
                        title="Step 2 — Results"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChartBarIcon className="h-3.5 w-3.5 mr-1" />
                        Log results
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteExperiment(experiment.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                        aria-label="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showNewExperimentModal && (
        <ExperimentForm
          mode="tracker"
          banner={
            linkedProtocolId ? (
              <p>
                Linked method <span className="font-medium">{linkedProtocolId}</span>. After create you will
                open the experiment page.
              </p>
            ) : undefined
          }
          initialData={{
            title: prefillTitle || undefined,
            protocolId: linkedProtocolId || undefined,
          }}
          onSubmit={handleCreateExperiment}
          onCancel={resetCreateModal}
          isLoading={loading}
        />
      )}

    </div>
  );
};

export default ExperimentTrackerPage;
