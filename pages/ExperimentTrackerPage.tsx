import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card, { CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ExperimentForm from '../components/ExperimentForm';
import ExperimentDetailView from '../components/ExperimentDetailView';
import { experimentService, Experiment, ExperimentTemplate, CreateExperimentData, UpdateExperimentData, ExperimentAnalytics } from '../services/experimentService';
import { useEntityDeepLink } from '../hooks/useEntityDeepLink';
import {
  BeakerIcon,
  PlusIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LightbulbIcon,
  ChartBarIcon,
  UserIcon,
  TagIcon,
  EyeIcon,
  EditIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  StarIcon,
  TargetIcon,
  ClipboardListIcon,
  DocumentTextIcon,
  CogIcon,
  BellIcon,
  ShareIcon,
  DownloadIcon,
  PrinterIcon,
  SparklesIcon,
  BrainIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  UsersIcon,
  GlobeAltIcon,
  FireIcon,

  XMarkIcon,
  CheckIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  InformationCircleIcon,
  ExclamationCircleIcon,
  QuestionMarkCircleIcon,
  TrendingUpIcon
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';

interface ExperimentTrackerPageProps {
  embedded?: boolean;
}

const ExperimentTrackerPage = ({ embedded = false }: ExperimentTrackerPageProps) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [templates, setTemplates] = useState<ExperimentTemplate[]>([]);
  const [analytics, setAnalytics] = useState<ExperimentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState<'dashboard' | 'experiments' | 'templates' | 'analytics'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [showNewExperimentModal, setShowNewExperimentModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showEditExperimentModal, setShowEditExperimentModal] = useState(false);
  const [showExperimentDetailModal, setShowExperimentDetailModal] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ExperimentTemplate | null>(null);
  const [linkedProtocolId, setLinkedProtocolId] = useState<string>('');
  const [methodNote, setMethodNote] = useState('');
  const [prefillTitle, setPrefillTitle] = useState<string>('');

  const openHighlightedExperiment = useCallback((experiment: Experiment) => {
    setActiveView('experiments');
    setSelectedExperiment(experiment);
    setShowExperimentDetailModal(true);
  }, []);
  const { focusedId } = useEntityDeepLink(experiments, openHighlightedExperiment);

  // Load initial data
  useEffect(() => {
    loadExperiments();
    loadTemplates();
    loadAnalytics();
  }, []);

  // Start-from-protocol / notebook handoff via query params
  useEffect(() => {
    const protocolId = searchParams.get('protocolId');
    const title = searchParams.get('title');
    const methodDoi = searchParams.get('methodDoi');
    const methodUrl = searchParams.get('methodUrl');
    if (protocolId || title || methodDoi) {
      if (protocolId) setLinkedProtocolId(protocolId);
      if (title) setPrefillTitle(title);
      if (methodDoi || methodUrl) {
        setMethodNote(
          `SpringerProtocols metadata only. DOI: ${methodDoi || 'none'}. ${methodUrl || ''} The full protocol is not stored in RILOS.`
        );
      }
      setShowNewExperimentModal(true);
      setActiveView('experiments');
      const next = new URLSearchParams(searchParams);
      next.delete('protocolId');
      next.delete('title');
      next.delete('methodDoi');
      next.delete('methodUrl');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const mapFormToCreateData = (data: Record<string, any>): CreateExperimentData => {
    const protocolId = data.protocolId || linkedProtocolId || undefined;
    const noteParts = [
      protocolId ? `Linked protocol: ${protocolId}` : '',
      data.protocolModifications ? `Protocol modifications: ${data.protocolModifications}` : '',
      data.problems ? `Problems: ${data.problems}` : '',
      data.troubleshooting ? `Troubleshooting: ${data.troubleshooting}` : '',
      data.resultsLink || data.notes || '',
      methodNote,
    ].filter(Boolean);

    return {
      title: data.title || prefillTitle || 'Untitled experiment',
      description: data.description || '',
      hypothesis: data.hypothesis || '',
      objectives: Array.isArray(data.objectives) ? data.objectives : [],
      methodology: data.methodology || data.protocolModifications || '',
      expectedOutcomes: Array.isArray(data.expectedOutcomes) ? data.expectedOutcomes : [],
      priority: data.priority || 'medium',
      category: data.category || 'other',
      estimatedDuration: data.estimatedDuration || 0,
      dueDate: data.dueDate,
      labId: data.labId || user?.lab_id || '',
      collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
      equipment: Array.isArray(data.equipment) ? data.equipment : [],
      materials: Array.isArray(data.materials) ? data.materials : [],
      reagents: Array.isArray(data.reagents) ? data.reagents : [],
      safetyRequirements: Array.isArray(data.safetyRequirements) ? data.safetyRequirements : [],
      budget: data.budget || 0,
      tags: Array.isArray(data.tags) ? data.tags : (protocolId ? [`protocol:${protocolId}`] : []),
      notes: noteParts.join('\n'),
      templateId: data.templateId || selectedTemplate?.id,
      protocolId,
      milestones: Array.isArray(data.milestones) ? data.milestones : (selectedTemplate?.milestones || []),
      risks: Array.isArray(data.risks) ? data.risks : [],
    };
  };

  const loadExperiments = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await experimentService.getExperiments({
        status: filterStatus,
        category: filterCategory,
        priority: filterPriority,
        search: searchTerm
      });
      setExperiments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading experiments:', error);
      setError('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await experimentService.getTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await experimentService.getAnalytics(30);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const handleCreateExperiment = async (data: any) => {
    try {
      const createData = mapFormToCreateData(data);
      const newExperiment = await experimentService.createExperiment(createData);
      setExperiments(prev => [newExperiment, ...prev]);
      setShowNewExperimentModal(false);
      setSelectedTemplate(null);
      setLinkedProtocolId('');
      setPrefillTitle('');
      await loadAnalytics();
    } catch (error) {
      console.error('Error creating experiment:', error);
      setError('Failed to create experiment');
    }
  };

  const handleUpdateExperiment = async (data: UpdateExperimentData) => {
    if (!selectedExperiment) return;
    
    try {
      const updatedExperiment = await experimentService.updateExperiment(selectedExperiment.id, data);
      setExperiments(prev => prev.map(exp => exp.id === updatedExperiment.id ? updatedExperiment : exp));
      setShowEditExperimentModal(false);
      setSelectedExperiment(null);
      await loadAnalytics(); // Refresh analytics
    } catch (error) {
      console.error('Error updating experiment:', error);
      setError('Failed to update experiment');
    }
  };

  const handleDeleteExperiment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this experiment?')) return;
    
    try {
      await experimentService.deleteExperiment(id);
      setExperiments(prev => prev.filter(exp => exp.id !== id));
      await loadAnalytics(); // Refresh analytics
    } catch (error) {
      console.error('Error deleting experiment:', error);
      setError('Failed to delete experiment');
    }
  };

  const handleStartExperiment = async (id: string) => {
    try {
      const updatedExperiment = await experimentService.startExperiment(id);
      setExperiments(prev => prev.map(exp => exp.id === updatedExperiment.id ? updatedExperiment : exp));
      await loadAnalytics();
    } catch (error) {
      console.error('Error starting experiment:', error);
      setError('Failed to start experiment');
    }
  };

  const handlePauseExperiment = async (id: string) => {
    try {
      const updatedExperiment = await experimentService.pauseExperiment(id);
      setExperiments(prev => prev.map(exp => exp.id === updatedExperiment.id ? updatedExperiment : exp));
      await loadAnalytics();
    } catch (error) {
      console.error('Error pausing experiment:', error);
      setError('Failed to pause experiment');
    }
  };

  const handleCompleteExperiment = async (id: string) => {
    const results = prompt('Enter experiment results:');
    if (results === null) return;
    
    try {
      const updatedExperiment = await experimentService.completeExperiment(id, { results });
      setExperiments(prev => prev.map(exp => exp.id === updatedExperiment.id ? updatedExperiment : exp));
      await loadAnalytics();
    } catch (error) {
      console.error('Error completing experiment:', error);
      setError('Failed to complete experiment');
    }
  };

  const handleViewExperiment = (experiment: Experiment) => {
    setSelectedExperiment(experiment);
    setShowExperimentDetailModal(true);
  };

  const handleEditExperiment = (experiment: Experiment) => {
    setSelectedExperiment(experiment);
    setShowEditExperimentModal(true);
  };

  const handleUseTemplate = (template: ExperimentTemplate) => {
    setSelectedTemplate(template);
    if (template.protocolId) {
      setLinkedProtocolId(template.protocolId);
    }
    setShowNewExperimentModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-yellow-100 text-yellow-800';
      case 'paused': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredExperiments = experiments.filter(exp => {
    const matchesSearch = exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exp.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' || exp.status === filterStatus;
    const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
    const matchesPriority = filterPriority === 'all' || exp.priority === filterPriority;
    
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  const sortedExperiments = [...filteredExperiments].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'priority':
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      case 'status':
        return a.status.localeCompare(b.status);
      case 'due_date':
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      case 'created_at':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return (
    <div className={embedded ? '' : 'max-w-7xl mx-auto'}>
        {/* Header - hidden when embedded in Lab workspace */}
        {!embedded && (
        <div className="mb-8">
          <PageHeader
            title="Experiments"
            accent="orange"
            icon={<BeakerIcon />}
            subtitle={
              <>
                Plan and track experiment lifecycle from hypothesis to completion.{' '}
                <Link to="/protocols" className="font-medium text-slate-800 hover:text-slate-950 underline-offset-2 hover:underline">
                  Methods live in Protocol library
                </Link>
              </>
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-orange-900 bg-white/90 border border-orange-200 rounded-md hover:bg-orange-50 transition-colors"
                >
                  <DocumentTextIcon className="h-4 w-4" />
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewExperimentModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-orange-700 rounded-md hover:bg-orange-800 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  New experiment
                </button>
              </>
            }
          />
        </div>
        )}
        {embedded && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-slate-600">
              Plan and track experiments from hypothesis to completion.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
              >
                <DocumentTextIcon className="h-4 w-4" />
                Templates
              </button>
              <button
                type="button"
                onClick={() => setShowNewExperimentModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                New experiment
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <ExclamationCircleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError('')}
                  className="text-red-400 hover:text-red-600"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="mb-6 flex gap-1 border-b border-slate-200" aria-label="Experiments sections">
            {[
              { id: 'dashboard', name: 'Overview', icon: ChartBarIcon },
              { id: 'experiments', name: 'Experiments', icon: BeakerIcon },
              { id: 'templates', name: 'Templates', icon: DocumentTextIcon },
              { id: 'analytics', name: 'Analytics', icon: TrendingUpIcon }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id as any)}
                className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
                  activeView === tab.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
                {activeView === tab.id && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-slate-900 rounded-full" />
                )}
              </button>
            ))}
        </nav>

        {/* Dashboard View */}
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                      <BeakerIcon className="h-5 w-5 text-slate-500" />
                    <div>
                      <p className="text-[12px] font-medium text-slate-500">Total experiments</p>
                      <p className="text-xl font-semibold text-slate-900 tabular-nums">{analytics?.totalExperiments || 0}</p>
                    </div>
                  </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                      <PlayIcon className="h-5 w-5 text-slate-500" />
                    <div>
                      <p className="text-[12px] font-medium text-slate-500">Running</p>
                      <p className="text-xl font-semibold text-slate-900 tabular-nums">{analytics?.runningExperiments || 0}</p>
                    </div>
                  </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                      <CheckCircleIcon className="h-5 w-5 text-slate-500" />
                    <div>
                      <p className="text-[12px] font-medium text-slate-500">Completed</p>
                      <p className="text-xl font-semibold text-slate-900 tabular-nums">{analytics?.completedExperiments || 0}</p>
                    </div>
                  </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                      <ExclamationTriangleIcon className="h-5 w-5 text-slate-500" />
                    <div>
                      <p className="text-[12px] font-medium text-slate-500">Overdue</p>
                      <p className="text-xl font-semibold text-slate-900 tabular-nums">{analytics?.overdueExperiments || 0}</p>
                    </div>
                  </div>
              </div>
            </div>

            {/* Recent Experiments */}
            <section className="bg-white border border-slate-200/80 rounded-xl p-5">
                <h2 className="text-[15px] font-semibold text-slate-900 mb-4">Recent experiments</h2>
                {sortedExperiments.length === 0 ? (
                  <div className="text-center py-10">
                    <BeakerIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-[15px] font-semibold text-slate-900 mb-1">No experiments yet</h3>
                    <p className="text-[13px] text-slate-500 mb-4">Create an experiment or start from a protocol</p>
                    <button
                      type="button"
                      onClick={() => setShowNewExperimentModal(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Create experiment
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedExperiments.slice(0, 5).map((experiment) => (
                      <div
                        key={experiment.id}
                        data-entity-id={experiment.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                          focusedId === experiment.id
                            ? 'border-sky-400 ring-2 ring-sky-200 bg-sky-50/50'
                            : 'border-slate-100 hover:bg-slate-50/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[13px] font-medium text-slate-900 truncate">{experiment.title}</h3>
                          <p className="text-[12px] text-slate-500 truncate mt-0.5">{experiment.description}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${getStatusColor(experiment.status)}`}>
                              {experiment.status.replace('_', ' ')}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${getPriorityColor(experiment.priority)}`}>
                              {experiment.priority}
                            </span>
                            {experiment.progressPercentage > 0 && (
                              <span className="text-[11px] text-slate-500">
                                {experiment.progressPercentage}% complete
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleViewExperiment(experiment)}
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditExperiment(experiment)}
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </section>
          </div>
        )}

        {/* Experiments View */}
        {activeView === 'experiments' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Search experiments..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 text-[13px]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="text-[13px]"
                    >
                      <option value="all">All Status</option>
                      <option value="planning">Planning</option>
                      <option value="ready">Ready</option>
                      <option value="running">Running</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                    </Select>
                    <Select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      <option value="molecular_biology">Molecular Biology</option>
                      <option value="cell_biology">Cell Biology</option>
                      <option value="biochemistry">Biochemistry</option>
                      <option value="microbiology">Microbiology</option>
                      <option value="genetics">Genetics</option>
                      <option value="immunology">Immunology</option>
                      <option value="neuroscience">Neuroscience</option>
                    </Select>
                    <Select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                    >
                      <option value="all">All Priorities</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </Select>
                    <Select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="text-[13px]"
                    >
                      <option value="created_at">Sort by Date</option>
                      <option value="priority">Sort by Priority</option>
                      <option value="status">Sort by Status</option>
                      <option value="title">Sort by Title</option>
                      <option value="due_date">Sort by Due Date</option>
                    </Select>
                  </div>
                </div>
            </div>

            {/* Experiments List */}
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4">Loading experiments...</p>
                </div>
              ) : sortedExperiments.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-12">
                      <BeakerIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No experiments found</h3>
                      <p className="text-gray-600 mb-4">Create your first experiment or adjust your search criteria</p>
                      <Button onClick={() => setShowNewExperimentModal(true)}>
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Create Experiment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                sortedExperiments.map((experiment) => (
                  <Card
                    key={experiment.id}
                    data-entity-id={experiment.id}
                    className={`hover:shadow-md transition-shadow ${
                      focusedId === experiment.id ? 'ring-2 ring-sky-300 border-sky-400' : ''
                    }`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-semibold text-gray-900">{experiment.title}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}>
                              {experiment.status.replace('_', ' ')}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(experiment.priority)}`}>
                              {experiment.priority}
                            </span>
                          </div>
                          <p className="text-gray-600 mb-3">{experiment.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            <span className="flex items-center">
                              <ClockIcon className="w-4 h-4 mr-1" />
                              {experiment.estimatedDuration}h estimated
                            </span>
                            <span className="flex items-center">
                              <CalendarIcon className="w-4 h-4 mr-1" />
                              {experiment.dueDate ? new Date(experiment.dueDate).toLocaleDateString() : 'No due date'}
                            </span>
                            <span className="flex items-center">
                              <UserIcon className="w-4 h-4 mr-1" />
                              {experiment.researcherName}
                            </span>
                            {experiment.progressPercentage > 0 && (
                              <span className="flex items-center">
                                <ChartBarIcon className="w-4 h-4 mr-1" />
                                {experiment.progressPercentage}% complete
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {experiment.tags.map((tag, index) => (
                              <span key={index} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewExperiment(experiment)}
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditExperiment(experiment)}
                          >
                            <EditIcon className="h-4 w-4" />
                          </Button>
                          {experiment.status === 'planning' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleStartExperiment(experiment.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <PlayIcon className="h-4 w-4" />
                            </Button>
                          )}
                          {experiment.status === 'running' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handlePauseExperiment(experiment.id)}
                              className="text-yellow-600 hover:text-yellow-700"
                            >
                              <PauseIcon className="h-4 w-4" />
                            </Button>
                          )}
                          {experiment.status === 'running' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleCompleteExperiment(experiment.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleDeleteExperiment(experiment.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* Templates View */}
        {activeView === 'templates' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900 mb-1">Experiment plan templates</p>
              <p>
                Templates are reusable experiment plans (milestones, equipment, timing). They should{' '}
                <span className="font-medium">reference a Protocol library SOP</span> - not duplicate the full method.
                Use{' '}
                <Link to="/protocols" className="text-blue-600 hover:text-blue-700 font-medium">
                  Protocol library
                </Link>
                {' '}for SOPs, then start an experiment from a protocol.
              </p>
            </div>
            {templates.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No templates yet</h3>
                    <p className="text-gray-600 mb-4 max-w-md mx-auto">
                      Prefer starting from a protocol when one exists. Templates are for plan structure only.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button onClick={() => window.location.assign('/protocols')} variant="outline">
                        Open Protocol library
                      </Button>
                      <Button onClick={() => setShowNewExperimentModal(true)}>
                        New experiment
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <DocumentTextIcon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{template.name}</h3>
                      <p className="text-gray-600 text-sm mb-3">{template.description}</p>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {template.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {template.estimatedDuration}h
                        </span>
                      </div>
                      {template.protocolId ? (
                        <p className="text-xs text-green-700 mb-4">
                          Linked protocol: {template.protocolId}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700 mb-4">
                          No protocol linked - attach one when you create the experiment
                        </p>
                      )}
                      <Button 
                        onClick={() => handleUseTemplate(template)}
                        className="w-full"
                      >
                        Use as plan
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Analytics View */}
        {activeView === 'analytics' && (
          <div className="space-y-6">
            {analytics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <TrendingUpIcon className="h-12 w-12 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Success Rate</h3>
                      <p className="text-3xl font-bold text-green-600">
                        {analytics.totalExperiments > 0 
                          ? Math.round((analytics.completedExperiments / analytics.totalExperiments) * 100)
                          : 0}%
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <ClockIcon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Avg Duration</h3>
                      <p className="text-3xl font-bold text-blue-600">
                        {Math.round(analytics.avgDuration || 0)}h
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <ChartBarIcon className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Avg Cost</h3>
                      <p className="text-3xl font-bold text-purple-600">
                        ${Math.round(analytics.avgCost || 0)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <TrendingUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Analytics Dashboard</h3>
                    <p className="text-gray-600 mb-4">Track your experiment performance and productivity</p>
                    <p className="text-sm text-gray-500">Analytics will appear once you have experiment data</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Modals */}
        {showNewExperimentModal && (
              <ExperimentForm
                mode="tracker"
                banner={
                  linkedProtocolId ? (
                    <p>
                      Starting from protocol{' '}
                      <span className="font-medium">{linkedProtocolId}</span>
                      {' - '}
                      <Link to="/protocols" className="underline">
                        view in Protocol library
                      </Link>
                      . The full SOP stays there; this experiment only stores the link.
                    </p>
                  ) : selectedTemplate ? (
                    <p>
                      Using plan template <span className="font-medium">{selectedTemplate.name}</span>
                      {selectedTemplate.protocolId || linkedProtocolId
                        ? ` with linked protocol ${selectedTemplate.protocolId || linkedProtocolId}.`
                        : '. Prefer linking a Protocol library SOP - templates should not duplicate the full method.'}
                    </p>
                  ) : undefined
                }
                initialData={{
                  title: prefillTitle || undefined,
                  protocolId: linkedProtocolId || undefined,
                  ...(selectedTemplate
                    ? {
                        description: selectedTemplate.description,
                        protocolModifications: selectedTemplate.methodology,
                      }
                    : {}),
                }}
                onSubmit={handleCreateExperiment}
                onCancel={() => {
                  setShowNewExperimentModal(false);
                  setSelectedTemplate(null);
                  setLinkedProtocolId('');
                  setPrefillTitle('');
                }}
                isLoading={loading}
              />
        )}

        {showEditExperimentModal && selectedExperiment && (
              <ExperimentForm
                mode="tracker"
                initialData={{
                  title: selectedExperiment.title,
                  description: selectedExperiment.description,
                  protocolId:
                    selectedExperiment.protocolId ||
                    selectedExperiment.tags?.find((t) => t.startsWith('protocol:'))?.replace('protocol:', '') ||
                    '',
                  protocolModifications: selectedExperiment.methodology,
                  resultsLink: selectedExperiment.notes || '',
                  startDate: selectedExperiment.startDate?.slice(0, 10) || '',
                  startTime: '',
                  problems: '',
                  troubleshooting: '',
                }}
                onSubmit={(data) => handleUpdateExperiment(mapFormToCreateData(data))}
                onCancel={() => {
                  setShowEditExperimentModal(false);
                  setSelectedExperiment(null);
                }}
                isLoading={loading}
              />
        )}

        {/* Experiment Detail Modal */}
        {showExperimentDetailModal && selectedExperiment && (
          <ExperimentDetailView
            experiment={selectedExperiment}
            onClose={() => {
              setShowExperimentDetailModal(false);
              setSelectedExperiment(null);
            }}
            onEdit={(experiment) => {
              setShowExperimentDetailModal(false);
              setSelectedExperiment(experiment);
              setShowEditExperimentModal(true);
            }}
            onDelete={handleDeleteExperiment}
            onStatusChange={(id, status) => {
              // Handle status change
              console.log('Status change:', id, status);
            }}
          />
        )}
    </div>
  );
};

export default ExperimentTrackerPage;