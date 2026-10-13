import React, { useMemo, useState } from 'react';
import {
  XMarkIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PlayIcon,
  ClockIcon,
  ShieldExclamationIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  BookOpenIcon,
  StarIcon,
  UserGroupIcon,
  PencilSquareIcon,
  TrashIcon,
  RocketLaunchIcon,
  TagIcon,
  SignalIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import Button from './ui/Button';
import ProtocolAIAssistant from './ProtocolAIAssistant';
import {
  formatDurationMinutes,
  protocolRefCode,
  protocolShareUrl,
  youtubeEmbedUrl,
} from '../utils/protocolShare';

export type ProtocolDetailStep = {
  id: number | string;
  title: string;
  description: string;
  duration?: number;
  critical?: boolean;
  materials_needed?: Array<{ name: string; quantity?: string; unit?: string }>;
  warnings?: string[];
  tips?: string[];
};

export type ProtocolDetailModel = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  version?: string;
  author?: string;
  usage_count?: number;
  success_rate?: number;
  rating?: number;
  total_ratings?: number;
  video_url?: string;
  objective?: string;
  background?: string;
  materials?: unknown[];
  equipment?: unknown[];
  safety_notes?: string[] | string;
  procedure?: ProtocolDetailStep[];
  content?: string;
  expected_results?: string;
  troubleshooting?: { issue: string; solution: string }[] | string;
  references?: string[];
  tags?: string[];
  difficulty_level?: string;
  estimated_duration?: number;
  privacy_level?: string;
  source?: 'drm' | 'protocols.io' | 'adapted' | 'springer_protocols';
  sourceUrl?: string;
  doi?: string;
  license?: string;
  attribution?: string;
  saved?: boolean;
};

type SimilarProtocol = {
  id: string;
  title: string;
  success_rate?: number;
  usage_count?: number;
};

type Props = {
  protocol: ProtocolDetailModel;
  similarProtocols?: SimilarProtocol[];
  canManage?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCollaborate?: () => void;
  onExecute?: () => void;
  onTrackExperiment?: () => void;
  onCompare?: (protocolId: string) => void;
  onOptimized?: (result: unknown) => void;
  onSaveExternal?: () => void;
  onAdaptExternal?: () => void;
  onSaveMetadata?: () => void;
  onFindOpenAlternative?: () => void;
  onFindLiterature?: () => void;
  onLinkMethod?: () => void;
  onOpenAlternative?: (item: { id: string; title: string; sourceLabel: string; kind: 'drm' | 'protocols.io' }) => void;
  methodAlternatives?: Array<{ id: string; title: string; sourceLabel: string; kind: 'drm' | 'protocols.io' }>;
  literatureNote?: string | null;
};

type SectionKey =
  | 'overview'
  | 'conditions'
  | 'video'
  | 'materials'
  | 'safety'
  | 'procedure'
  | 'results'
  | 'troubleshoot'
  | 'references';

const asStringList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item) {
          const row = item as { name?: string; quantity?: string; unit?: string };
          const qty = [row.quantity, row.unit].filter(Boolean).join(' ');
          return qty ? `${row.name} (${qty})` : String(row.name || '');
        }
        return String(item);
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return asStringList(parsed);
    } catch {
      /* plain text */
    }
    return trimmed
      .split(/\n/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
};

const parseContentSections = (content?: string) => {
  if (!content?.trim()) return {} as Record<string, string>;
  const sections: Record<string, string> = {};
  const parts = content.split(/^##\s+/m).filter(Boolean);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    if (!body) continue;
    if (heading.includes('objective')) sections.objective = body;
    else if (heading.includes('background')) sections.background = body;
    else if (heading.includes('scope')) sections.scope = body;
    else if (heading.includes('sample')) sections.sample = body;
    else if (heading.includes('experimental condition') || heading.includes('conditions'))
      sections.conditions = body;
    else if (heading.includes('reagent setup') || heading.includes('buffer setup'))
      sections.reagentSetup = body;
    else if (heading.includes('material') || heading.includes('reagent')) sections.materials = body;
    else if (heading.includes('equipment')) sections.equipment = body;
    else if (heading.includes('safety')) sections.safety = body;
    else if (heading.includes('control') || heading.includes('acceptance'))
      sections.controls = body;
    else if (heading.includes('procedure') || heading.includes('method')) sections.procedure = body;
    else if (heading.includes('expected')) sections.expected = body;
    else if (heading.includes('troubleshoot')) sections.troubleshooting = body;
    else if (heading.includes('reference')) sections.references = body;
  }
  return sections;
};

const ProtocolDetailView: React.FC<Props> = ({
  protocol,
  similarProtocols = [],
  canManage = false,
  onClose,
  onEdit,
  onDelete,
  onCollaborate,
  onExecute,
  onTrackExperiment,
  onCompare,
  onOptimized,
  onSaveExternal,
  onAdaptExternal,
  onSaveMetadata,
  onFindOpenAlternative,
  onFindLiterature,
  onLinkMethod,
  onOpenAlternative,
  methodAlternatives = [],
  literatureNote,
}) => {
  const [copied, setCopied] = useState<'link' | 'id' | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [showOptimize, setShowOptimize] = useState(false);

  const refCode = useMemo(() => protocolRefCode(protocol.id), [protocol.id]);
  const shareUrl = useMemo(
    () => ((protocol.source === 'protocols.io' || protocol.source === 'springer_protocols') && protocol.sourceUrl
      ? protocol.sourceUrl
      : protocolShareUrl(protocol.id)),
    [protocol.id, protocol.source, protocol.sourceUrl]
  );
  const embedUrl = useMemo(() => youtubeEmbedUrl(protocol.video_url), [protocol.video_url]);
  const contentSections = useMemo(
    () => parseContentSections(protocol.content),
    [protocol.content]
  );

  const materials = asStringList(protocol.materials).length
    ? asStringList(protocol.materials)
    : asStringList(contentSections.materials);
  const equipment = asStringList(protocol.equipment).length
    ? asStringList(protocol.equipment)
    : asStringList(contentSections.equipment);
  const safetyNotes = asStringList(protocol.safety_notes).length
    ? asStringList(protocol.safety_notes)
    : asStringList(contentSections.safety);
  const references = asStringList(protocol.references).length
    ? asStringList(protocol.references)
    : asStringList(contentSections.references);
  const tags = asStringList(protocol.tags);

  const objective = protocol.objective || contentSections.objective || protocol.description || '';
  const background = protocol.background || contentSections.background || '';
  const scope = contentSections.scope || '';
  const sampleReqs = contentSections.sample || '';
  const conditions = contentSections.conditions || '';
  const reagentSetup = contentSections.reagentSetup || '';
  const controlsText = contentSections.controls || '';
  const expected = protocol.expected_results || contentSections.expected || '';
  const procedureSteps = Array.isArray(protocol.procedure) ? protocol.procedure : [];
  const procedureFallback =
    contentSections.procedure ||
    (procedureSteps.length === 0 && protocol.content && !contentSections.objective
      ? protocol.content
      : '');

  const troubleshootingRows: { issue: string; solution: string }[] = (() => {
    if (Array.isArray(protocol.troubleshooting)) return protocol.troubleshooting;
    const raw =
      typeof protocol.troubleshooting === 'string'
        ? protocol.troubleshooting
        : contentSections.troubleshooting || '';
    if (!raw.trim()) return [];
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[:–—-]/);
        if (parts.length >= 2) {
          return { issue: parts[0].trim(), solution: parts.slice(1).join(':').trim() };
        }
        return { issue: line, solution: '' };
      });
  })();

  const stepMinutes =
    procedureSteps.reduce((acc, s) => acc + (Number(s.duration) || 0), 0) ||
    Number(protocol.estimated_duration) ||
    0;

  const copy = async (kind: 'link' | 'id') => {
    try {
      await navigator.clipboard.writeText(kind === 'link' ? shareUrl : refCode);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const scrollTo = (key: SectionKey) => {
    setActiveSection(key);
    const el = document.getElementById(`protocol-section-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navItems: { key: SectionKey; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'conditions', label: 'Conditions', show: !!(conditions || reagentSetup || sampleReqs || scope) },
    { key: 'materials', label: 'Materials', show: materials.length > 0 || equipment.length > 0 },
    { key: 'safety', label: 'Safety', show: safetyNotes.length > 0 || !!controlsText },
    { key: 'procedure', label: 'Procedure', show: true },
    { key: 'results', label: 'Expected results', show: !!expected },
    { key: 'troubleshoot', label: 'Troubleshooting', show: troubleshootingRows.length > 0 },
    { key: 'references', label: 'References', show: references.length > 0 },
    { key: 'video', label: 'Demo video', show: !!embedUrl },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4">
      <div
        className="relative flex flex-col w-full max-w-6xl h-[100dvh] sm:h-auto sm:max-h-[94vh] bg-white sm:rounded-2xl overflow-hidden border border-slate-200/80 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protocol-detail-title"
      >
        {/* Hero header */}
        <div className="shrink-0 bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-800 text-white px-5 sm:px-7 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-[11px] font-semibold tracking-wide">
                  <SignalIcon className="w-3.5 h-3.5" />
                  {refCode}
                </span>
                {protocol.version ? (
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px]">
                    v{protocol.version}
                  </span>
                ) : null}
                {protocol.category ? (
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] capitalize">
                    {String(protocol.category).replace(/_/g, ' ')}
                  </span>
                ) : null}
                {protocol.privacy_level ? (
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] capitalize">
                    {protocol.privacy_level}
                  </span>
                ) : null}
              </div>
              <h2
                id="protocol-detail-title"
                className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug"
              >
                {protocol.title}
              </h2>
              <p className="mt-1.5 text-[13px] text-teal-50/85 line-clamp-2">
                {protocol.description || objective || 'Structured laboratory method'}
              </p>
              {protocol.attribution ? (
                <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-[12px] leading-relaxed text-white">
                  {protocol.source === 'protocols.io'
                    ? 'protocols.io · CC-BY. '
                    : protocol.source === 'springer_protocols'
                      ? 'SpringerProtocols metadata. '
                      : 'Adapted DRM protocol. '}
                  {protocol.attribution}
                  {protocol.sourceUrl ? (
                    <>
                      {' '}
                      <a className="underline" href={protocol.sourceUrl} target="_blank" rel="noreferrer">
                        Original
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-teal-100/90">
                {protocol.author ? <span>By {protocol.author}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {formatDurationMinutes(stepMinutes)}
                </span>
                <span>{procedureSteps.length || '—'} steps</span>
                {typeof protocol.success_rate === 'number' && protocol.success_rate > 0 ? (
                  <span>{protocol.success_rate}% reported success</span>
                ) : null}
                {typeof protocol.usage_count === 'number' && protocol.usage_count > 0 ? (
                  <span>{protocol.usage_count} runs</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close protocol"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="hidden lg:block border-r border-slate-100 bg-gradient-to-b from-teal-50/40 to-white p-3 overflow-y-auto">
            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Sections
            </p>
            <ul className="space-y-0.5">
              {navItems
                .filter((item) => item.show)
                .map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => scrollTo(item.key)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                        activeSection === item.key
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-600 hover:bg-teal-50 hover:text-teal-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
            </ul>

            <div className="mt-4 mx-1 rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Protocol ID</div>
              <div className="mt-0.5 font-mono text-[13px] font-semibold text-teal-900">{refCode}</div>
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                Cite this SOP in notebooks and experiments with the ID or shareable link.
              </p>
            </div>
          </nav>

          <div className="overflow-y-auto px-5 sm:px-7 py-5 space-y-8 scroll-smooth">
            {/* Overview */}
            <section id="protocol-section-overview" className="scroll-mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
                {[
                  {
                    label: 'Duration',
                    value: formatDurationMinutes(stepMinutes),
                    tone: 'from-sky-50 to-white border-sky-100',
                  },
                  {
                    label: 'Steps',
                    value: String(procedureSteps.length || '—'),
                    tone: 'from-teal-50 to-white border-teal-100',
                  },
                  {
                    label: 'Success',
                    value:
                      typeof protocol.success_rate === 'number' && protocol.success_rate > 0
                        ? `${protocol.success_rate}%`
                        : '—',
                    tone: 'from-emerald-50 to-white border-emerald-100',
                  },
                  {
                    label: 'Rating',
                    value:
                      protocol.rating && protocol.rating > 0
                        ? `${protocol.rating.toFixed(1)}★`
                        : '—',
                    tone: 'from-amber-50 to-white border-amber-100',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`rounded-xl border bg-gradient-to-br ${stat.tone} px-3 py-2.5`}
                  >
                    <div className="text-[11px] text-slate-500">{stat.label}</div>
                    <div className="text-[16px] font-semibold text-slate-900 mt-0.5">{stat.value}</div>
                  </div>
                ))}
              </div>

              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-teal-800 mb-2 flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4" />
                Objective
              </h3>
              <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                {objective || 'No objective documented yet.'}
              </p>
              {background ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Background & rationale
                  </h4>
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {background}
                  </p>
                </div>
              ) : null}
              {tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-800 border border-teal-100 px-2.5 py-0.5 text-[11px] font-medium"
                    >
                      <TagIcon className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            {(conditions || reagentSetup || sampleReqs || scope) ? (
              <section id="protocol-section-conditions" className="scroll-mt-4 space-y-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-teal-800">
                  Experimental design
                </h3>
                {scope ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Scope
                    </h4>
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {scope}
                    </p>
                  </div>
                ) : null}
                {sampleReqs ? (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wide text-sky-800 mb-1.5">
                      Sample / starting material
                    </h4>
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {sampleReqs}
                    </p>
                  </div>
                ) : null}
                {conditions ? (
                  <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-4">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wide text-teal-900 mb-1.5">
                      Experimental conditions
                    </h4>
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {conditions}
                    </p>
                  </div>
                ) : null}
                {reagentSetup ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wide text-amber-900 mb-1.5">
                      Reagent & buffer setup
                    </h4>
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {reagentSetup}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Materials */}
            {(materials.length > 0 || equipment.length > 0) && (
              <section id="protocol-section-materials" className="scroll-mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {materials.length > 0 ? (
                    <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4">
                      <h3 className="text-[13px] font-semibold text-sky-900 mb-3 flex items-center gap-2">
                        <BeakerIcon className="w-4 h-4" />
                        Materials & reagents
                      </h3>
                      <ol className="space-y-2">
                        {materials.map((item, i) => (
                          <li key={`${item}-${i}`} className="flex gap-2 text-[13px] text-slate-700">
                            <span className="shrink-0 w-5 h-5 rounded bg-sky-100 text-sky-800 text-[11px] font-semibold flex items-center justify-center">
                              {i + 1}
                            </span>
                            <span className="leading-snug">{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {equipment.length > 0 ? (
                    <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 to-white p-4">
                      <h3 className="text-[13px] font-semibold text-teal-900 mb-3 flex items-center gap-2">
                        <WrenchScrewdriverIcon className="w-4 h-4" />
                        Equipment
                      </h3>
                      <ul className="space-y-2">
                        {equipment.map((item, i) => (
                          <li key={`${item}-${i}`} className="flex gap-2 text-[13px] text-slate-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                            <span className="leading-snug">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {/* Safety */}
            {(safetyNotes.length > 0 || controlsText) ? (
              <section id="protocol-section-safety" className="scroll-mt-4 space-y-3">
                {safetyNotes.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4">
                    <h3 className="text-[13px] font-semibold text-amber-950 mb-3 flex items-center gap-2">
                      <ShieldExclamationIcon className="w-4 h-4" />
                      Safety & caution
                    </h3>
                    <ul className="space-y-2">
                      {safetyNotes.map((note, i) => (
                        <li
                          key={`${note}-${i}`}
                          className="flex gap-2 text-[13px] text-amber-950/90 leading-relaxed"
                        >
                          <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {controlsText ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <h3 className="text-[13px] font-semibold text-emerald-950 mb-2">
                      Controls & acceptance criteria
                    </h3>
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {controlsText}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Procedure */}
            <section id="protocol-section-procedure" className="scroll-mt-4">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-teal-800 mb-3 flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4" />
                Procedure
              </h3>
              {procedureSteps.length > 0 ? (
                <ol className="relative space-y-3 border-l-2 border-teal-200 ml-3 pl-5">
                  {procedureSteps.map((step, index) => (
                    <li key={String(step.id ?? index)} className="relative">
                      <span
                        className={`absolute -left-[1.7rem] top-0 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ${
                          step.critical
                            ? 'bg-rose-600 text-white ring-2 ring-rose-200'
                            : 'bg-teal-700 text-white'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div
                        className={`rounded-xl border p-4 ${
                          step.critical
                            ? 'border-rose-200 bg-rose-50/50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="text-[14px] font-semibold text-slate-900">
                            {step.title || `Step ${index + 1}`}
                          </h4>
                          {step.critical ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-rose-600 text-white">
                              Critical
                            </span>
                          ) : null}
                          {step.duration ? (
                            <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              {step.duration} min
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {step.description}
                        </p>
                        {step.warnings?.length ? (
                          <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-900">
                            {step.warnings.join(' · ')}
                          </div>
                        ) : null}
                        {step.tips?.length ? (
                          <div className="mt-2 flex gap-2 text-[12px] text-sky-800">
                            <LightBulbIcon className="w-4 h-4 shrink-0" />
                            <span>{step.tips.join(' · ')}</span>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : procedureFallback ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <pre className="whitespace-pre-wrap text-[13px] text-slate-700 leading-relaxed font-sans">
                    {procedureFallback}
                  </pre>
                </div>
              ) : (
                <p className="text-[13px] text-slate-500">No procedure documented yet.</p>
              )}
            </section>

            {expected ? (
              <section id="protocol-section-results" className="scroll-mt-4">
                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4">
                  <h3 className="text-[13px] font-semibold text-emerald-900 mb-2">
                    Expected results
                  </h3>
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {expected}
                  </p>
                </div>
              </section>
            ) : null}

            {troubleshootingRows.length > 0 ? (
              <section id="protocol-section-troubleshoot" className="scroll-mt-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-700 mb-3">
                  Troubleshooting
                </h3>
                <div className="space-y-2">
                  {troubleshootingRows.map((row, i) => (
                    <div
                      key={`${row.issue}-${i}`}
                      className="rounded-xl border border-slate-200 bg-white p-3.5"
                    >
                      <div className="text-[13px] font-semibold text-slate-900">{row.issue}</div>
                      {row.solution ? (
                        <div className="mt-1 text-[13px] text-slate-600 leading-relaxed">
                          {row.solution}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {references.length > 0 ? (
              <section id="protocol-section-references" className="scroll-mt-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-700 mb-3">
                  References
                </h3>
                <ol className="space-y-1.5 list-decimal list-inside text-[13px] text-slate-700">
                  {references.map((ref, i) => (
                    <li key={`${ref}-${i}`} className="leading-relaxed">
                      {ref}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {embedUrl ? (
              <section id="protocol-section-video" className="scroll-mt-4">
                <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-950">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <PlayIcon className="w-4 h-4 text-rose-400" />
                      Method demo
                      <span className="text-[11px] font-normal text-slate-300">
                        Watch the walkthrough after reviewing the method
                      </span>
                    </div>
                  </div>
                  <div className="relative w-full aspect-video">
                    <iframe
                      title={`${protocol.title} demo video`}
                      src={embedUrl}
                      className="absolute inset-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {/* Compare */}
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Compare methods</h3>
              {similarProtocols.length > 0 ? (
                <div className="space-y-2">
                  {similarProtocols.slice(0, 3).map((similar) => (
                    <button
                      key={similar.id}
                      type="button"
                      onClick={() => onCompare?.(similar.id)}
                      className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-teal-300 transition-colors"
                    >
                      <div className="text-[13px] font-medium text-slate-900">{similar.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {protocolRefCode(similar.id)}
                        {similar.success_rate ? ` · ${similar.success_rate}% success` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-slate-500">
                  No close matches yet. Use Compare with another protocol ID when you have one.
                </p>
              )}
            </section>
          </div>
        </div>

        {literatureNote || methodAlternatives.length ? (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 text-[13px] text-slate-700">
            {literatureNote ? <p>{literatureNote}</p> : null}
            {methodAlternatives.length ? (
              <div className="mt-2 space-y-1">
                <p className="font-medium text-slate-900">Open alternatives</p>
                {methodAlternatives.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    className="block text-left text-teal-800 underline"
                    onClick={() => onOpenAlternative?.(item)}
                  >
                    {item.sourceLabel}: {item.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Footer actions */}
        <div className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] text-slate-600">
              <StarIcon className="w-4 h-4 text-amber-500" />
              <span>
                {protocol.rating && protocol.rating > 0
                  ? `${protocol.rating.toFixed(1)} (${protocol.total_ratings || 0} reviews)`
                  : 'No ratings yet'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void copy('link')}
                title={shareUrl}
              >
                {copied === 'link' ? (
                  <CheckIcon className="w-4 h-4 mr-1.5 text-emerald-600" />
                ) : (
                  <LinkIcon className="w-4 h-4 mr-1.5" />
                )}
                {copied === 'link' ? 'Link copied' : 'Share link'}
              </Button>
              <Button variant="outline" onClick={() => void copy('id')} title={refCode}>
                {copied === 'id' ? (
                  <CheckIcon className="w-4 h-4 mr-1.5 text-emerald-600" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4 mr-1.5" />
                )}
                {copied === 'id' ? 'ID copied' : 'Copy ID'}
              </Button>
              {canManage && onEdit ? (
                <Button variant="outline" onClick={onEdit}>
                  <PencilSquareIcon className="w-4 h-4 mr-1.5" />
                  Edit
                </Button>
              ) : null}
              {canManage && onDelete ? (
                <Button
                  variant="outline"
                  onClick={onDelete}
                  className="text-red-700 border-red-200 hover:bg-red-50"
                >
                  <TrashIcon className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              ) : null}
              {onCollaborate && protocol.source !== 'protocols.io' && protocol.source !== 'springer_protocols' ? (
                <Button variant="outline" onClick={onCollaborate}>
                  <UserGroupIcon className="w-4 h-4 mr-1.5" />
                  Collaborate
                </Button>
              ) : null}
              {onSaveExternal ? (
                <Button variant="outline" onClick={onSaveExternal}>
                  {protocol.saved ? 'Saved' : 'Save to library'}
                </Button>
              ) : null}
              {onAdaptExternal ? (
                <Button variant="outline" onClick={onAdaptExternal}>
                  Adapt for my lab
                </Button>
              ) : null}
              {protocol.source === 'springer_protocols' && protocol.sourceUrl ? (
                <Button variant="outline" onClick={() => window.open(protocol.sourceUrl, '_blank', 'noopener,noreferrer')}>
                  Open source
                </Button>
              ) : null}
              {onSaveMetadata ? (
                <Button variant="outline" onClick={onSaveMetadata}>
                  Save metadata
                </Button>
              ) : null}
              {onFindOpenAlternative ? (
                <Button variant="outline" onClick={onFindOpenAlternative}>
                  Find open alternative
                </Button>
              ) : null}
              {onFindLiterature ? (
                <Button variant="outline" onClick={onFindLiterature}>
                  Find related literature
                </Button>
              ) : null}
              {onLinkMethod ? (
                <Button variant="outline" onClick={onLinkMethod}>
                  Link to experiment
                </Button>
              ) : null}
              {onTrackExperiment ? (
                <Button variant="outline" onClick={onTrackExperiment}>
                  <BeakerIcon className="w-4 h-4 mr-1.5" />
                  {protocol.source === 'protocols.io' ? 'Use in experiment' : 'Track experiment'}
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setShowOptimize(true)}>
                <SparklesIcon className="w-4 h-4 mr-1.5" />
                Optimize
              </Button>
              {onExecute ? (
                <Button
                  onClick={onExecute}
                  className="bg-teal-700 hover:bg-teal-800 text-white border-transparent"
                >
                  <RocketLaunchIcon className="w-4 h-4 mr-1.5" />
                  Start execution
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showOptimize && (
        <ProtocolAIAssistant
          contentOrigin={
            protocol.source === 'protocols.io'
              ? 'original'
              : protocol.source === 'springer_protocols'
                ? 'springer'
                : protocol.source === 'adapted'
                  ? 'adaptation'
                  : 'drm'
          }
          protocol={{
            id: protocol.id,
            title: protocol.title,
            description: protocol.description || objective || '',
            steps: procedureSteps.map((s) => ({
              id: Number(s.id) || 0,
              title: s.title,
              description: s.description,
              duration: Number(s.duration) || 0,
              materials_needed: s.materials_needed,
            })),
            materials: Array.isArray(protocol.materials) ? protocol.materials : [],
            equipment: Array.isArray(protocol.equipment) ? protocol.equipment : [],
          }}
          onClose={() => setShowOptimize(false)}
          onOptimized={(result) => {
            onOptimized?.(result);
          }}
        />
      )}
    </div>
  );
};

export default ProtocolDetailView;
