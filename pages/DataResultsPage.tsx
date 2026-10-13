import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import DataResultForm, { DataResultFormValues } from '../components/DataResultForm';
import CreateEvidencePackModal, { PackBasics } from '../components/evidence/CreateEvidencePackModal';
import DocumentImportModal from '../components/DocumentImportModal';
import LinkedEntityChips, { buildWorkflowLinks } from '../components/LinkedEntityChips';
import ProvenanceBadge from '../components/ProvenanceBadge';
import { useEntityDeepLink } from '../hooks/useEntityDeepLink';
import { smartParseDataResultText } from '../utils/dataResultImport';
import { apiUrl, getAuthHeaders, formatApiNetworkError } from '../utils/apiBase';
import { resultWorkspaceUrl } from '../utils/evidenceChain';
import {
  ARTIFACT_META,
  ArtifactKind,
  buildFilesFromPack,
  loadPackFromMetadata,
  sanitizePackForStorage,
  summarizePack,
  artifactHasContent,
  createEmptyArtifact,
  EvidencePackData,
} from '../utils/evidencePack';
import {
  SearchIcon,
  BarChartIcon,
  PlusIcon,
  TableIcon,
  ChartBarIcon,
  EyeIcon,
  EditIcon,
  TrashIcon,
  DownloadIcon,
  DatabaseIcon,
  FilesIcon,
  ImageIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  ArrowRightIcon,
  SparklesIcon,
  DocumentTextIcon,
  BeakerIcon,
  TrendingUpIcon,
  DocumentArrowUpIcon,
  LinkIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
} from '../components/icons';
import { PageHeader, PagePanel, PageStat } from '../components/PageHeader';

type ResultType = 'experiment' | 'analysis' | 'image' | 'document' | 'protocol' | 'code';
type ResultStatus = 'draft' | 'published' | 'archived' | 'under_review';
type ResultCategory =
  | 'molecular_biology'
  | 'cell_biology'
  | 'biochemistry'
  | 'microbiology'
  | 'bioinformatics'
  | 'other';

interface ResearchDataEntry {
  id: string;
  title: string;
  type: ResultType;
  category: ResultCategory | string;
  date: Date;
  updatedAt?: Date;
  status: ResultStatus;
  tags: string[];
  summary: string;
  description?: string;
  methodology?: string;
  results?: string;
  conclusions?: string;
  author: string;
  lab: string;
  privacyLevel?: string;
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
  files: {
    name: string;
    type: string;
    size: number;
    url: string;
    uploadedAt: Date;
  }[];
  metadata: {
    experimentDate?: Date;
    sampleCount?: number;
    replicates?: number;
    conditions?: string[];
    instruments?: string[] | string;
    reagents?: string[] | string;
    notes?: string;
    analysisMethod?: string;
    software?: string;
    pack?: EvidencePackData;
    artifactKinds?: ArtifactKind[];
    /** @deprecated legacy — migrated via loadPackFromMetadata */
    evidenceFormats?: string[];
    evidenceBlocks?: unknown[];
  };
}

type WorkspaceView = 'library' | 'pipeline' | 'insights';
type LinkageFilter = 'all' | 'linked' | 'orphan';
type CompletenessFilter = 'all' | 'ready' | 'partial' | 'thin';

interface CompletenessReport {
  score: number;
  level: 'ready' | 'partial' | 'thin';
  checks: { key: string; label: string; ok: boolean }[];
  missing: string[];
}

const STATUS_FLOW: ResultStatus[] = ['draft', 'under_review', 'published', 'archived'];

const STATUS_META: Record<
  ResultStatus,
  { label: string; hint: string; chip: string; column: string }
> = {
  draft: {
    label: 'Working notes',
    hint: 'Capture raw outputs while the experiment is fresh',
    chip: 'bg-amber-50 text-amber-800 border-amber-100',
    column: 'border-amber-200 bg-amber-50/40',
  },
  under_review: {
    label: 'Lab review',
    hint: 'Ready for PI / peer scrutiny before locking',
    chip: 'bg-sky-50 text-sky-800 border-sky-100',
    column: 'border-sky-200 bg-sky-50/40',
  },
  published: {
    label: 'Curated',
    hint: 'Provenance complete — cite or share confidently',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    column: 'border-emerald-200 bg-emerald-50/40',
  },
  archived: {
    label: 'Archived',
    hint: 'Superseded or closed — retained for audit',
    chip: 'bg-slate-100 text-slate-600 border-slate-200',
    column: 'border-slate-200 bg-slate-50/60',
  },
};

function assessCompleteness(entry: ResearchDataEntry): CompletenessReport {
  const pack = loadPackFromMetadata(entry.metadata);
  const artifacts = pack.artifacts;
  const hasArtifactContent = artifacts.some(artifactHasContent);
  const hasNarrativeEvidence =
    Boolean(entry.results?.trim()) ||
    artifacts.some((a) => a.kind === 'text' && artifactHasContent(a));
  const hasStructuredEvidence = artifacts.some(
    (a) =>
      (a.kind === 'table' || a.kind === 'sheet' || a.kind === 'image') && artifactHasContent(a)
  );
  const hasFiles =
    (entry.files || []).length > 0 ||
    artifacts.some((a) => (a.kind === 'image' || a.kind === 'sheet') && artifactHasContent(a));

  const checks = [
    { key: 'summary', label: 'Summary', ok: Boolean(entry.summary?.trim()) },
    { key: 'methodology', label: 'Methods', ok: Boolean(entry.methodology?.trim()) },
    {
      key: 'results',
      label: 'Results / evidence content',
      ok: hasNarrativeEvidence || hasArtifactContent,
    },
    { key: 'conclusions', label: 'Interpretation', ok: Boolean(entry.conclusions?.trim()) },
    {
      key: 'link',
      label: 'Linked protocol / experiment / notebook',
      ok: Boolean(entry.protocolId || entry.experimentId || entry.notebookEntryId),
    },
    {
      key: 'files',
      label: 'Structured artifacts (table / sheet / figure)',
      ok: hasFiles || hasStructuredEvidence,
    },
    { key: 'tags', label: 'Searchable tags', ok: (entry.tags || []).length > 0 },
  ];
  const weights: Record<string, number> = {
    summary: 15,
    methodology: 15,
    results: 20,
    conclusions: 15,
    link: 15,
    files: 10,
    tags: 10,
  };
  const score = checks.reduce((sum, c) => sum + (c.ok ? weights[c.key] || 0 : 0), 0);
  const level: CompletenessReport['level'] =
    score >= 75 ? 'ready' : score >= 40 ? 'partial' : 'thin';
  return {
    score,
    level,
    checks,
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}

function refCode(id: string) {
  return `DAT-${String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'ENTRY'}`;
}

function typeIcon(type: string, className = 'w-3.5 h-3.5') {
  switch (type) {
    case 'experiment':
      return <BeakerIcon className={className} />;
    case 'analysis':
      return <ChartBarIcon className={className} />;
    case 'image':
      return <ImageIcon className={className} />;
    case 'document':
      return <FilesIcon className={className} />;
    case 'code':
      return <DocumentTextIcon className={className} />;
    default:
      return <DatabaseIcon className={className} />;
  }
}

function formatLabel(value: string) {
  return String(value || '').replace(/_/g, ' ');
}

function CompletenessRing({ score, size = 40 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  const color =
    score >= 75 ? 'stroke-emerald-500' : score >= 40 ? 'stroke-amber-500' : 'stroke-rose-400';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`${score}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-slate-200" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={color}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
        {score}
      </span>
    </div>
  );
}

const DataResultsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<WorkspaceView>('library');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLinkage, setFilterLinkage] = useState<LinkageFilter>('all');
  const [filterCompleteness, setFilterCompleteness] = useState<CompletenessFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'type' | 'completeness'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [dataEntries, setDataEntries] = useState<ResearchDataEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ResearchDataEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [addFormInitial, setAddFormInitial] = useState<Partial<DataResultFormValues> | undefined>();
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  // Evidence-chain handoff: /data-results?create=1&experimentId=&protocolId=&notebookEntryId=&title=
  useEffect(() => {
    const create = searchParams.get('create');
    if (create !== '1' && create !== 'true') return;

    setAddFormInitial({
      title: searchParams.get('title') || '',
      summary: searchParams.get('summary') || '',
      protocolId: searchParams.get('protocolId') || '',
      experimentId: searchParams.get('experimentId') || '',
      notebookEntryId: searchParams.get('notebookEntryId') || '',
      type: 'experiment',
    } as Partial<DataResultFormValues>);
    setShowAddModal(true);

    const next = new URLSearchParams(searchParams);
    ['create', 'title', 'summary', 'protocolId', 'experimentId', 'notebookEntryId'].forEach((k) =>
      next.delete(k)
    );
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const normalizeRow = useCallback((r: any, fallbackAuthor = ''): ResearchDataEntry => {
    const filesRaw = Array.isArray(r.files) ? r.files : [];
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      category: r.category,
      date: new Date(r.created_at || r.date || Date.now()),
      updatedAt: r.updated_at ? new Date(r.updated_at) : undefined,
      status: (r.status || 'draft') as ResultStatus,
      tags: Array.isArray(r.tags) ? r.tags : [],
      summary: r.summary || '',
      description: r.description || '',
      methodology: r.methodology || '',
      results: r.results || r.analysis?.results || '',
      conclusions: r.conclusions || '',
      author: r.username || r.author || [r.first_name, r.last_name].filter(Boolean).join(' ') || fallbackAuthor,
      lab: r.lab_name || r.lab || '',
      privacyLevel: r.privacy_level || 'lab',
      protocolId: r.protocolId || r.protocol_id || null,
      experimentId: r.experimentId || r.experiment_id || null,
      notebookEntryId: r.notebookEntryId || r.notebook_entry_id || null,
      files: filesRaw.map((f: any) => ({
        name: f.name || 'file',
        type: f.type || '',
        size: f.size || 0,
        url: f.url || '',
        uploadedAt: f.uploadedAt ? new Date(f.uploadedAt) : new Date(),
      })),
      metadata: r.metadata || {},
    };
  }, []);

  const openHighlightedResult = useCallback(
    (entry: ResearchDataEntry) => {
      navigate(
        resultWorkspaceUrl({
          resultId: entry.id,
          experimentId: entry.experimentId,
        })
      );
    },
    [navigate]
  );
  const { focusedId } = useEntityDeepLink(dataEntries, openHighlightedResult);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/data/results'), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to load results (${response.status})`);
      }
      const data = await response.json();
      const rows = data.results || data || [];
      setDataEntries(rows.map((r: any) => normalizeRow(r, user?.username || '')));
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(formatApiNetworkError(err, 'Could not load Evidence'));
      setDataEntries([]);
    } finally {
      setLoading(false);
    }
  }, [normalizeRow, user?.username]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createDataEntry = async (entryData: any) => {
    const response = await fetch(apiUrl('/data/results'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: entryData.title,
        type: entryData.type,
        category: entryData.category,
        summary: entryData.summary,
        description: entryData.description,
        methodology: entryData.methodology,
        results: entryData.results,
        conclusions: entryData.conclusions,
        tags: entryData.tags || [],
        privacy_level: entryData.privacy_level || 'lab',
        lab_id: entryData.lab_id,
        protocolId: entryData.protocolId || null,
        experimentId: entryData.experimentId || null,
        notebookEntryId: entryData.notebookEntryId || null,
        files: entryData.files || [],
        metadata: entryData.metadata || {},
        status: entryData.status || 'draft',
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || 'Failed to create entry');
    }
    const r = await response.json();
    const newEntry = normalizeRow(r, user?.username || '');
    setDataEntries((prev) => [newEntry, ...prev]);
    setShowAddModal(false);
    navigate(
      resultWorkspaceUrl({
        resultId: newEntry.id,
        experimentId: newEntry.experimentId,
      })
    );
  };

  const updateDataEntry = async (id: string, entryData: any) => {
    const response = await fetch(apiUrl(`/data/results/${id}`), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: entryData.title,
        type: entryData.type,
        category: entryData.category,
        summary: entryData.summary,
        description: entryData.description,
        methodology: entryData.methodology,
        results: entryData.results,
        conclusions: entryData.conclusions,
        tags: entryData.tags || [],
        privacy_level: entryData.privacy_level || 'lab',
        protocolId: entryData.protocolId || null,
        experimentId: entryData.experimentId || null,
        notebookEntryId: entryData.notebookEntryId || null,
        files: entryData.files || [],
        metadata: entryData.metadata || {},
        status: entryData.status,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to update entry');
    }
    const updatedEntry = await response.json();
    const r = updatedEntry.result || updatedEntry;
    const normalized = normalizeRow(
      { ...r, ...entryData, status: entryData.status ?? r.status },
      user?.username || ''
    );
    setDataEntries((prev) => prev.map((entry) => (entry.id === id ? normalized : entry)));
    setSelectedEntry(normalized);
    return normalized;
  };

  const deleteDataEntry = async (id: string) => {
    const response = await fetch(apiUrl(`/data/results/${id}`), {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (response.ok || response.status === 404) {
      setDataEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (selectedEntry?.id === id) setSelectedEntry(null);
    } else {
      throw new Error('Failed to delete entry');
    }
  };

  const advanceStatus = async (entry: ResearchDataEntry, next: ResultStatus) => {
    setStatusBusyId(entry.id);
    try {
      await updateDataEntry(entry.id, {
        title: entry.title,
        type: entry.type,
        category: entry.category,
        summary: entry.summary,
        description: entry.description,
        methodology: entry.methodology,
        results: entry.results,
        conclusions: entry.conclusions,
        tags: entry.tags,
        privacy_level: entry.privacyLevel || 'lab',
        protocolId: entry.protocolId || null,
        experimentId: entry.experimentId || null,
        notebookEntryId: entry.notebookEntryId || null,
        files: entry.files,
        metadata: entry.metadata,
        status: next,
      });
    } catch (err) {
      setError(formatApiNetworkError(err, 'Could not update status'));
    } finally {
      setStatusBusyId(null);
    }
  };

  const completenessMap = useMemo(() => {
    const map = new Map<string, CompletenessReport>();
    dataEntries.forEach((e) => map.set(e.id, assessCompleteness(e)));
    return map;
  }, [dataEntries]);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return dataEntries
      .filter((entry) => {
        const report = completenessMap.get(entry.id)!;
        const linked = Boolean(entry.protocolId || entry.experimentId || entry.notebookEntryId);
        const matchesType = filterType === 'all' || entry.type === filterType;
        const matchesStatus = filterStatus === 'all' || entry.status === filterStatus;
        const matchesCategory = filterCategory === 'all' || entry.category === filterCategory;
        const matchesLinkage =
          filterLinkage === 'all' ||
          (filterLinkage === 'linked' && linked) ||
          (filterLinkage === 'orphan' && !linked);
        const matchesCompleteness =
          filterCompleteness === 'all' || report.level === filterCompleteness;
        const matchesSearch =
          q === '' ||
          entry.title.toLowerCase().includes(q) ||
          entry.summary.toLowerCase().includes(q) ||
          (entry.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
          (entry.author || '').toLowerCase().includes(q);
        return (
          matchesType &&
          matchesStatus &&
          matchesCategory &&
          matchesLinkage &&
          matchesCompleteness &&
          matchesSearch
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'date':
            comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
          case 'completeness':
            comparison =
              (completenessMap.get(a.id)?.score || 0) - (completenessMap.get(b.id)?.score || 0);
            break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [
    dataEntries,
    completenessMap,
    searchTerm,
    filterType,
    filterStatus,
    filterCategory,
    filterLinkage,
    filterCompleteness,
    sortBy,
    sortOrder,
  ]);

  const stats = useMemo(() => {
    const total = dataEntries.length;
    const ready = dataEntries.filter((e) => (completenessMap.get(e.id)?.score || 0) >= 75).length;
    const linked = dataEntries.filter(
      (e) => e.protocolId || e.experimentId || e.notebookEntryId
    ).length;
    const needsAttention = dataEntries.filter((e) => {
      const score = completenessMap.get(e.id)?.score || 0;
      return e.status === 'draft' && score < 40;
    }).length;
    const inReview = dataEntries.filter((e) => e.status === 'under_review').length;
    const curated = dataEntries.filter((e) => e.status === 'published').length;
    const byType: Record<string, number> = {};
    dataEntries.forEach((e) => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    const orphaned = total - linked;
    const avgCompleteness =
      total === 0
        ? 0
        : Math.round(
            dataEntries.reduce((s, e) => s + (completenessMap.get(e.id)?.score || 0), 0) / total
          );
    const recent = [...dataEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
    return {
      total,
      ready,
      linked,
      needsAttention,
      inReview,
      curated,
      byType,
      orphaned,
      avgCompleteness,
      recent,
    };
  }, [dataEntries, completenessMap]);

  const openEntry = (entry: ResearchDataEntry) => {
    navigate(
      resultWorkspaceUrl({
        resultId: entry.id,
        experimentId: entry.experimentId,
      })
    );
  };

  const DataEntryCard = ({ entry, compact = false }: { entry: ResearchDataEntry; compact?: boolean }) => {
    const isList = viewMode === 'list' && !compact;
    const report = completenessMap.get(entry.id)!;
    const linkedCount = [entry.protocolId, entry.experimentId, entry.notebookEntryId].filter(Boolean)
      .length;

    return (
      <article
        data-entity-id={entry.id}
        role="button"
        tabIndex={0}
        onClick={() => openEntry(entry)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openEntry(entry);
          }
        }}
        className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-sky-50/25 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          focusedId === entry.id
            ? 'border-sky-400 ring-2 ring-sky-200'
            : 'border-slate-200/90'
        } ${isList ? 'sm:flex sm:items-stretch' : 'flex flex-col'} ${compact ? 'p-0' : ''}`}
      >
        <div
          className={`absolute ${isList ? 'left-0 top-0 bottom-0 w-1' : 'inset-x-0 top-0 h-1'} bg-gradient-to-r from-sky-600 to-cyan-500`}
          aria-hidden="true"
        />

        <div className={`flex-1 min-w-0 p-4 sm:p-5 ${isList ? 'sm:pr-4' : ''}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="inline-flex items-center rounded-md bg-sky-50 text-sky-800 border border-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                  {refCode(entry.id)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium capitalize">
                  {typeIcon(entry.type)}
                  {formatLabel(entry.type)}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border ${STATUS_META[entry.status]?.chip || STATUS_META.draft.chip}`}
                >
                  {STATUS_META[entry.status]?.label || formatLabel(entry.status)}
                </span>
                <ProvenanceBadge
                  compact
                  ids={{
                    protocolId: entry.protocolId,
                    experimentId: entry.experimentId,
                    notebookEntryId: entry.notebookEntryId,
                  }}
                />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight line-clamp-2 group-hover:text-sky-900 transition-colors">
                {entry.title}
              </h3>
            </div>
            <CompletenessRing score={report.score} size={compact ? 36 : 40} />
          </div>

          {!compact && (
            <p className={`text-[13px] text-slate-600 leading-relaxed ${isList ? 'line-clamp-2 max-w-3xl' : 'line-clamp-2'}`}>
              {entry.summary || 'No summary yet — add one so collaborators know what this evidence shows.'}
            </p>
          )}

          {!compact && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(entry.tags || []).slice(0, 3).map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                  {tag}
                </span>
              ))}
              {(entry.tags || []).length > 3 && (
                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 text-[11px]">
                  +{(entry.tags || []).length - 3}
                </span>
              )}
              {loadPackFromMetadata(entry.metadata)
                .artifacts.filter(artifactHasContent)
                .reduce<ArtifactKind[]>((acc, a) => {
                  if (!acc.includes(a.kind)) acc.push(a.kind);
                  return acc;
                }, [])
                .slice(0, 4)
                .map((kind) => (
                  <span
                    key={kind}
                    className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-100 text-[11px] font-medium"
                  >
                    {ARTIFACT_META[kind].short}
                  </span>
                ))}
              {report.missing.slice(0, 1).map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100 text-[11px]"
                >
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  Missing {m.toLowerCase()}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5 text-sky-600" />
              {entry.date ? new Date(entry.date).toLocaleDateString() : 'No date'}
            </span>
            {!compact && (
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-sky-600" />
                {entry.author || 'Unknown'}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-slate-500">
              <LinkIcon className="w-3.5 h-3.5 text-sky-600" />
              {linkedCount === 3 ? 'Full chain' : `${linkedCount}/3 upstream`}
            </span>
            {(entry.files || []).length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FilesIcon className="w-3.5 h-3.5 text-sky-600" />
                {entry.files.length} file{entry.files.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {!compact && (
          <div
            className={`flex gap-2 p-4 sm:p-5 pt-0 ${
              isList
                ? 'sm:pt-5 sm:border-l sm:border-slate-100 sm:items-center sm:shrink-0 sm:w-40 sm:flex-col'
                : 'mt-auto border-t border-slate-100/80'
            }`}
          >
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openEntry(entry);
              }}
            >
              Open
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 space-y-4">
        <PageHeader
          title="Data & Results"
          accent="sky"
          icon={<DatabaseIcon />}
          subtitle={
            <>
              Evidence packs with provenance, methods, and interpretation — so findings stay
              reproducible and publication-ready.{' '}
              <Link
                to="/research-databank"
                className="font-medium text-slate-800 hover:text-slate-950 underline-offset-2 hover:underline"
              >
                Share curated datasets in Data bank
              </Link>
            </>
          }
          actions={
            <>
              <Link
                to="/writing-studio/tools/generate"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-teal-900 bg-white/90 border border-teal-200 rounded-md hover:bg-teal-50 transition-colors"
              >
                <SparklesIcon className="w-4 h-4" />
                Results → paper
              </Link>
              <button
                type="button"
                onClick={() => fetchData()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-slate-700 bg-white/90 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-sky-900 bg-white/90 border border-sky-200 rounded-md hover:bg-sky-50 transition-colors"
              >
                <DocumentArrowUpIcon className="w-4 h-4" />
                Import report
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddFormInitial(undefined);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-md hover:bg-sky-800 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                New pack
              </button>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PageStat label="Records" value={stats.total} accent="sky" />
          <PageStat
            label="Publication-ready"
            value={stats.ready}
            accent="emerald"
            action={
              <button
                type="button"
                className="text-[11px] text-emerald-700 hover:underline"
                onClick={() => {
                  setFilterCompleteness('ready');
                  setActiveView('library');
                }}
              >
                View
              </button>
            }
          />
          <PageStat
            label="In lab review"
            value={stats.inReview}
            accent="sky"
            action={
              <button
                type="button"
                className="text-[11px] text-sky-700 hover:underline"
                onClick={() => {
                  setFilterStatus('under_review');
                  setActiveView('pipeline');
                }}
              >
                Pipeline
              </button>
            }
          />
          <PageStat
            label="Needs attention"
            value={stats.needsAttention}
            accent="amber"
            action={
              <button
                type="button"
                className="text-[11px] text-amber-800 hover:underline"
                onClick={() => {
                  setFilterCompleteness('thin');
                  setFilterStatus('draft');
                  setActiveView('library');
                }}
              >
                Fix gaps
              </button>
            }
          />
        </div>

        <nav className="flex gap-1 border-b border-slate-200" aria-label="Evidence workspace">
          {(
            [
              { id: 'library' as const, name: 'Library', icon: DatabaseIcon },
              { id: 'pipeline' as const, name: 'Results pipeline', icon: ClipboardDocumentCheckIcon },
              { id: 'insights' as const, name: 'Insights', icon: TrendingUpIcon },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
                activeView === tab.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
              {activeView === tab.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sky-600" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeView === 'library' && (
        <div className="space-y-4">
          <PagePanel accent="sky">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1 relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search title, summary, tags, author…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">All types</option>
                    <option value="experiment">Experiment outputs</option>
                    <option value="analysis">Analysis</option>
                    <option value="image">Images / figures</option>
                    <option value="document">Documents</option>
                    <option value="code">Code / scripts</option>
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">Working notes</option>
                    <option value="under_review">Lab review</option>
                    <option value="published">Curated</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">All fields</option>
                    <option value="molecular_biology">Molecular biology</option>
                    <option value="cell_biology">Cell biology</option>
                    <option value="biochemistry">Biochemistry</option>
                    <option value="microbiology">Microbiology</option>
                    <option value="bioinformatics">Bioinformatics</option>
                    <option value="other">Other</option>
                  </select>
                  <select
                    value={filterLinkage}
                    onChange={(e) => setFilterLinkage(e.target.value as LinkageFilter)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">Any linkage</option>
                    <option value="linked">Provenance linked</option>
                    <option value="orphan">Orphan (no links)</option>
                  </select>
                  <select
                    value={filterCompleteness}
                    onChange={(e) => setFilterCompleteness(e.target.value as CompletenessFilter)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="all">Any completeness</option>
                    <option value="ready">Ready (≥75%)</option>
                    <option value="partial">Partial (40–74%)</option>
                    <option value="thin">Thin (&lt;40%)</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="date">Sort by date</option>
                    <option value="title">Sort by title</option>
                    <option value="type">Sort by type</option>
                    <option value="completeness">Sort by completeness</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 text-[12px] font-medium"
                  >
                    {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600"
                    title={viewMode === 'grid' ? 'List view' : 'Grid view'}
                  >
                    {viewMode === 'grid' ? <TableIcon className="w-4 h-4" /> : <BarChartIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {(filterType !== 'all' ||
                filterStatus !== 'all' ||
                filterCategory !== 'all' ||
                filterLinkage !== 'all' ||
                filterCompleteness !== 'all' ||
                searchTerm) && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[12px] text-slate-500">
                    Showing {filteredData.length} of {dataEntries.length} records with active filters
                  </p>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-sky-700 hover:underline"
                    onClick={() => {
                      setFilterType('all');
                      setFilterStatus('all');
                      setFilterCategory('all');
                      setFilterLinkage('all');
                      setFilterCompleteness('all');
                      setSearchTerm('');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </PagePanel>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-[13px] text-slate-500">
              Loading Evidence…
            </div>
          ) : filteredData.length > 0 ? (
            <div
              className={`grid gap-3.5 ${
                viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
              }`}
            >
              {filteredData.map((entry) => (
                <DataEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-cyan-50/40 text-center py-14 px-6">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <DatabaseIcon className="w-6 h-6" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-1 tracking-tight">
                {dataEntries.length === 0 ? 'Start your evidence trail' : 'No matches'}
              </h3>
              <p className="text-[13px] text-slate-500 mb-4 max-w-lg mx-auto leading-relaxed">
                {dataEntries.length === 0
                  ? 'Create a pack (folder) for one run, then add notes, tables, sheets, and images inside — the way you organize a lab drive.'
                  : 'Try clearing filters or searching a different keyword.'}
              </p>
              {dataEntries.length === 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
                  {['Text', 'Table', 'Sheet', 'Image', 'Stats', 'Code'].map((label) => (
                    <span
                      key={label}
                      className="px-2.5 py-1 rounded-md bg-white border border-sky-100 text-sky-800 text-[11px] font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-sky-900 bg-white border border-sky-200 rounded-lg hover:bg-sky-50"
                >
                  <DocumentArrowUpIcon className="w-4 h-4" />
                  Import Word / paste
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddFormInitial(undefined);
                    setShowAddModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800"
                >
                  <PlusIcon className="w-4 h-4" />
                  New pack
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'pipeline' && (
        <div className="space-y-4">
          <PagePanel
            accent="sky"
            title="Move evidence through curation"
            action={
              <span className="text-[12px] text-slate-500">
                Draft → Lab review → Curated → Archive
              </span>
            }
          >
            <p className="text-[13px] text-slate-600 leading-relaxed -mt-2 mb-1">
              Treat results like manuscript figures: capture raw, peer-check, then lock for citation.
              Drag is not required — advance status from the card or the inspector.
            </p>
          </PagePanel>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {STATUS_FLOW.map((status) => {
              const columnItems = dataEntries
                .filter((e) => e.status === status)
                .sort(
                  (a, b) =>
                    (completenessMap.get(b.id)?.score || 0) - (completenessMap.get(a.id)?.score || 0)
                );
              const meta = STATUS_META[status];
              return (
                <div
                  key={status}
                  className={`rounded-2xl border ${meta.column} p-3 min-h-[280px] flex flex-col`}
                >
                  <div className="mb-3 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-slate-900">{meta.label}</h3>
                      <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                        {columnItems.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{meta.hint}</p>
                  </div>
                  <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[60vh] pr-0.5">
                    {columnItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200/80 bg-white/50 px-3 py-8 text-center text-[12px] text-slate-400">
                        Empty
                      </div>
                    ) : (
                      columnItems.map((entry) => {
                        const idx = STATUS_FLOW.indexOf(status);
                        const next = STATUS_FLOW[idx + 1];
                        const prev = STATUS_FLOW[idx - 1];
                        return (
                          <div key={entry.id} className="space-y-1.5">
                            <DataEntryCard entry={entry} compact />
                            <div className="flex gap-1.5 px-0.5">
                              {prev && (
                                <button
                                  type="button"
                                  disabled={statusBusyId === entry.id}
                                  onClick={() => advanceStatus(entry, prev)}
                                  className="flex-1 text-[11px] py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  ← {STATUS_META[prev].label}
                                </button>
                              )}
                              {next && (
                                <button
                                  type="button"
                                  disabled={statusBusyId === entry.id}
                                  onClick={() => advanceStatus(entry, next)}
                                  className="flex-1 text-[11px] py-1 rounded-md border border-sky-200 bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50"
                                >
                                  {STATUS_META[next].label} →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeView === 'insights' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PagePanel accent="sky" title="Lab readiness" className="lg:col-span-1">
              <div className="space-y-4">
                <div>
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-[12px] text-slate-500">Avg. completeness</span>
                    <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {stats.avgCompleteness}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stats.avgCompleteness >= 75
                          ? 'bg-emerald-500'
                          : stats.avgCompleteness >= 40
                            ? 'bg-amber-500'
                            : 'bg-rose-400'
                      }`}
                      style={{ width: `${stats.avgCompleteness}%` }}
                    />
                  </div>
                </div>
                <ul className="space-y-2 text-[13px]">
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-600">Curated (citable)</span>
                    <span className="font-medium text-slate-900">{stats.curated}</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-600">Provenance linked</span>
                    <span className="font-medium text-slate-900">
                      {stats.linked}
                      <span className="text-slate-400 font-normal"> / {stats.total}</span>
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-600">Orphan records</span>
                    <span className="font-medium text-amber-800">{stats.orphaned}</span>
                  </li>
                </ul>
              </div>
            </PagePanel>

            <PagePanel accent="sky" title="Evidence mix" className="lg:col-span-1">
              <div className="space-y-2.5">
                {Object.keys(stats.byType).length === 0 ? (
                  <p className="text-[13px] text-slate-500">No types yet.</p>
                ) : (
                  Object.entries(stats.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-100">
                          {typeIcon(type, 'w-4 h-4')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-[13px] mb-1">
                            <span className="capitalize text-slate-800 font-medium">
                              {formatLabel(type)}
                            </span>
                            <span className="text-slate-500 tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-sky-500 rounded-full"
                              style={{
                                width: `${stats.total ? Math.round((count / stats.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </PagePanel>

            <PagePanel accent="amber" title="Recommended next actions" className="lg:col-span-1">
              <ul className="space-y-3">
                {stats.orphaned > 0 && (
                  <li className="flex gap-2.5 text-[13px]">
                    <LinkIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900">
                        Link {stats.orphaned} orphan record{stats.orphaned === 1 ? '' : 's'}
                      </p>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Connect to protocol / experiment so results stay auditable.
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-[12px] font-medium text-sky-700 hover:underline"
                        onClick={() => {
                          setFilterLinkage('orphan');
                          setActiveView('library');
                        }}
                      >
                        Show orphans
                      </button>
                    </div>
                  </li>
                )}
                {stats.needsAttention > 0 && (
                  <li className="flex gap-2.5 text-[13px]">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900">
                        Flesh out {stats.needsAttention} thin draft
                        {stats.needsAttention === 1 ? '' : 's'}
                      </p>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Add methods, results, or files before memory fades.
                      </p>
                    </div>
                  </li>
                )}
                {stats.ready > 0 && stats.inReview === 0 && (
                  <li className="flex gap-2.5 text-[13px]">
                    <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900">
                        {stats.ready} record{stats.ready === 1 ? '' : 's'} look publication-ready
                      </p>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Send them to lab review, then mark curated.
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-[12px] font-medium text-sky-700 hover:underline"
                        onClick={() => setActiveView('pipeline')}
                      >
                        Open pipeline
                      </button>
                    </div>
                  </li>
                )}
                {stats.total === 0 && (
                  <li className="flex gap-2.5 text-[13px]">
                    <SparklesIcon className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900">Log your first evidence pack</p>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Import a report or capture a figure with methods while the run is still warm.
                      </p>
                    </div>
                  </li>
                )}
                {stats.total > 0 &&
                  stats.orphaned === 0 &&
                  stats.needsAttention === 0 && (
                    <li className="flex gap-2.5 text-[13px]">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-900">Evidence hygiene looks solid</p>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          Keep advancing curated items and share eligible datasets in Data bank.
                        </p>
                      </div>
                    </li>
                  )}
              </ul>
            </PagePanel>
          </div>

          <PagePanel accent="sky" title="Recent activity">
            {stats.recent.length === 0 ? (
              <p className="text-[13px] text-slate-500">No activity yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.recent.map((entry) => {
                  const report = completenessMap.get(entry.id)!;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-50/80 -mx-1 px-1 rounded-lg transition-colors"
                    >
                      <CompletenessRing score={report.score} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-slate-900 truncate">
                          {entry.title}
                        </div>
                        <div className="text-[12px] text-slate-500 capitalize">
                          {formatLabel(entry.type)} · {STATUS_META[entry.status]?.label} ·{' '}
                          {entry.date.toLocaleDateString()}
                        </div>
                      </div>
                      <ArrowRightIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </PagePanel>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <DocumentImportModal
          title="Import research report"
          subtitle="Upload a Word report or paste notes — we’ll map summary, methods, results, and conclusions."
          parseText={smartParseDataResultText}
          onCancel={() => setShowImportModal(false)}
          onParsed={(result) => {
            setShowImportModal(false);
            setAddFormInitial(result.payload);
            setShowAddModal(true);
          }}
        />
      )}

      {/* New pack = empty folder */}
      {showAddModal && (
        <CreateEvidencePackModal
          initial={addFormInitial as Partial<PackBasics> | undefined}
          isSubmitting={isUploading}
          onCancel={() => {
            setShowAddModal(false);
            setAddFormInitial(undefined);
          }}
          onCreate={async (basics) => {
            setIsUploading(true);
            setError('');
            try {
              const seeded: EvidencePackData = { version: 2, artifacts: [] };
              if (addFormInitial?.results?.trim()) {
                const text = createEmptyArtifact('text', 'Imported findings');
                if (text.kind === 'text') {
                  text.body = addFormInitial.results;
                  text.finding = addFormInitial.results.slice(0, 180);
                  seeded.artifacts.push(text);
                }
              }
              const clean = sanitizePackForStorage(seeded);
              await createDataEntry({
                title: basics.title,
                type: basics.type,
                category: basics.category,
                summary: basics.summary,
                description: basics.description || addFormInitial?.description || '',
                methodology: addFormInitial?.methodology || '',
                results: addFormInitial?.results || '',
                conclusions: addFormInitial?.conclusions || '',
                tags: basics.tags.length ? basics.tags : addFormInitial?.tags || [],
                privacy_level: basics.privacy_level,
                protocolId: basics.protocolId || null,
                experimentId: basics.experimentId || null,
                notebookEntryId: basics.notebookEntryId || null,
                files: buildFilesFromPack(clean.artifacts),
                metadata: {
                  pack: clean,
                  artifactKinds: clean.artifacts.map((a) => a.kind),
                },
              });
              setShowAddModal(false);
              setAddFormInitial(undefined);
            } catch (err) {
              setError(formatApiNetworkError(err, 'Could not create pack'));
            } finally {
              setIsUploading(false);
            }
          }}
        />
      )}

      {showEditModal && selectedEntry && (
        <DataResultForm
          mode="edit"
          isSubmitting={isUploading}
          initialData={{
            title: selectedEntry.title,
            type: (selectedEntry.type === 'protocol'
              ? 'document'
              : selectedEntry.type) as DataResultFormValues['type'],
            category: selectedEntry.category,
            summary: selectedEntry.summary,
            description: selectedEntry.description || '',
            methodology: selectedEntry.methodology || '',
            results: selectedEntry.results || '',
            conclusions: selectedEntry.conclusions || '',
            tags: selectedEntry.tags || [],
            privacy_level:
              (selectedEntry.privacyLevel as DataResultFormValues['privacy_level']) || 'lab',
            protocolId: selectedEntry.protocolId || '',
            experimentId: selectedEntry.experimentId || '',
            notebookEntryId: selectedEntry.notebookEntryId || '',
            evidenceFormats: undefined,
            evidenceBlocks: undefined,
            metadata: {
              sampleCount: selectedEntry.metadata?.sampleCount,
              replicates: selectedEntry.metadata?.replicates,
              instruments: Array.isArray(selectedEntry.metadata?.instruments)
                ? selectedEntry.metadata.instruments.join(', ')
                : (selectedEntry.metadata?.instruments as string) || '',
              reagents: Array.isArray(selectedEntry.metadata?.reagents)
                ? selectedEntry.metadata.reagents.join(', ')
                : (selectedEntry.metadata?.reagents as string) || '',
              analysisMethod: selectedEntry.metadata?.analysisMethod,
              software: selectedEntry.metadata?.software,
            },
            fileNames: [],
          }}
          onCancel={() => setShowEditModal(false)}
          onSubmit={async (form) => {
            setIsUploading(true);
            setError('');
            try {
              await updateDataEntry(selectedEntry.id, {
                title: form.title,
                type: form.type,
                category: form.category,
                summary: form.summary,
                description: form.description,
                methodology: form.methodology,
                results: form.results,
                conclusions: form.conclusions,
                tags: form.tags,
                privacy_level: form.privacy_level,
                protocolId: form.protocolId || null,
                experimentId: form.experimentId || null,
                notebookEntryId: form.notebookEntryId || null,
                files: form.files || [],
                metadata: form.metadata,
                status: selectedEntry.status,
              });
              setShowEditModal(false);
            } catch (err) {
              setError(formatApiNetworkError(err, 'Could not update pack settings'));
            } finally {
              setIsUploading(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default DataResultsPage;
