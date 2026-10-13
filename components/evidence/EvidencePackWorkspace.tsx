import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LinkedEntityChips, { buildWorkflowLinks } from '../LinkedEntityChips';
import ArtifactEditorHost from './ArtifactEditorHost';
import PackReviewView from './PackReviewView';
import EvidenceAIPanel from './EvidenceAIPanel';
import { writingFromEvidenceUrl } from '../../utils/evidenceChain';
import {
  CheckIcon,
  DocumentTextIcon,
  EyeIcon,
  FilesIcon,
  FolderIcon,
  PhotoIcon,
  PlusIcon,
  TableCellsIcon,
  TrashIcon,
  XMarkIcon,
  EditIcon,
} from '../icons';
import {
  ARTIFACT_META,
  ArtifactKind,
  EvidencePackData,
  PackArtifact,
  artifactHasContent,
  summarizePack,
} from '../../utils/evidencePack';

const KIND_ICON: Record<ArtifactKind, React.FC<React.SVGProps<SVGSVGElement>>> = {
  text: DocumentTextIcon,
  table: TableCellsIcon,
  sheet: FilesIcon,
  image: PhotoIcon,
};

export type PackWorkspaceEntry = {
  id: string;
  title: string;
  summary: string;
  status: string;
  type: string;
  category: string;
  author?: string;
  date?: string | Date;
  tags?: string[];
  methodology?: string;
  conclusions?: string;
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
  metadata?: Record<string, unknown>;
};

type Props = {
  entry: PackWorkspaceEntry;
  pack: EvidencePackData;
  isSaving?: boolean;
  onClose: () => void;
  onSavePack: (patch: {
    title: string;
    summary: string;
    methodology: string;
    conclusions: string;
    pack: EvidencePackData;
  }) => void | Promise<void>;
  onDeletePack?: () => void;
};

/**
 * Evidence pack workspace (v2):
 * Four artifact kinds only — text, table, sheet, image —
 * each with a distinct scientific job (claim / derived / raw / visual).
 */
const EvidencePackWorkspace: React.FC<Props> = ({
  entry,
  pack: initialPack,
  isSaving,
  onClose,
  onSavePack,
  onDeletePack,
}) => {
  const [title, setTitle] = useState(entry.title);
  const [summary, setSummary] = useState(entry.summary);
  const [methodology, setMethodology] = useState(entry.methodology || '');
  const [conclusions, setConclusions] = useState(entry.conclusions || '');
  const [artifacts, setArtifacts] = useState<PackArtifact[]>([...initialPack.artifacts]);
  const [filter, setFilter] = useState<ArtifactKind | 'all'>('all');
  const [editor, setEditor] = useState<
    | { mode: 'create'; kind: ArtifactKind }
    | { mode: 'edit'; artifact: PackArtifact }
    | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showInterp, setShowInterp] = useState(
    Boolean(entry.methodology?.trim() || entry.conclusions?.trim())
  );

  const visible = useMemo(
    () => (filter === 'all' ? artifacts : artifacts.filter((a) => a.kind === filter)),
    [artifacts, filter]
  );

  const saveArtifact = (artifact: PackArtifact) => {
    setArtifacts((prev) => {
      const idx = prev.findIndex((a) => a.id === artifact.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = artifact;
        return next;
      }
      return [...prev, artifact];
    });
    setEditor(null);
    setDirty(true);
  };

  const removeArtifact = (id: string) => {
    if (!confirm('Remove this item from the pack?')) return;
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
    setDirty(true);
  };

  const persist = async () => {
    await onSavePack({
      title: title.trim() || entry.title,
      summary: summary.trim() || title.trim(),
      methodology,
      conclusions,
      pack: { version: 2, artifacts },
    });
    setDirty(false);
  };

  const addButtons: { kind: ArtifactKind; label: string }[] = [
    { kind: 'text', label: 'Text result' },
    { kind: 'table', label: 'Summary table' },
    { kind: 'sheet', label: 'Datasheet' },
    { kind: 'image', label: 'Figure' },
  ];

  const previewLine = (a: PackArtifact): string => {
    switch (a.kind) {
      case 'text':
        return a.finding || a.body.slice(0, 90) || 'Open to write the finding';
      case 'table':
        return `${a.columns.length} cols · ${a.rows.length} rows${a.footnotes ? ' · footnotes' : ''}`;
      case 'sheet':
        return `${a.rows.length} × ${a.headers.length}${a.assay ? ` · ${a.assay}` : ''}${a.fileName ? ` · ${a.fileName}` : ''}`;
      case 'image':
        return [a.modality, a.title || a.fileName || 'No caption yet'].filter(Boolean).join(' · ');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close pack"
        onClick={() => {
          if (dirty && !confirm('Discard unsaved changes to this pack?')) return;
          onClose();
        }}
      />
      <aside className="relative h-full w-full max-w-3xl bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
              <FolderIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                className="w-full text-lg font-semibold text-slate-900 tracking-tight bg-transparent border-0 focus:outline-none p-0"
                placeholder="Pack name"
              />
              <input
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value);
                  setDirty(true);
                }}
                className="mt-1 w-full text-[13px] text-slate-600 bg-transparent border-0 focus:outline-none p-0"
                placeholder="One line: what experiment / analysis this pack covers"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="capitalize px-1.5 py-0.5 rounded-md bg-white border border-slate-200">
                  {String(entry.status || 'draft').replace(/_/g, ' ')}
                </span>
                <span>{summarizePack(artifacts)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (dirty && !confirm('Discard unsaved changes?')) return;
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LinkedEntityChips
              links={buildWorkflowLinks({
                protocolId: entry.protocolId,
                experimentId: entry.experimentId,
                notebookEntryId: entry.notebookEntryId,
              })}
            />
            <Link
              to={writingFromEvidenceUrl({
                evidenceId: entry.id,
                title: entry.title,
                summary: entry.summary,
              })}
              className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-950 hover:bg-teal-100"
            >
              Continue in Writing Studio →
            </Link>
          </div>
        </div>

        <div className="shrink-0 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Add to pack
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {addButtons.map(({ kind, label }) => {
              const Icon = KIND_ICON[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setEditor({ mode: 'create', kind })}
                  className="flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-left hover:border-sky-300 hover:bg-sky-50/40 shadow-sm"
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <PlusIcon className="w-3 h-3" />
                    {ARTIFACT_META[kind].role}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                    <Icon className="w-4 h-4 text-sky-700" />
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            Sheet = raw · Table = paper-ready · Figure = visual · Text = claim + caveats
          </p>
        </div>

        <div className="shrink-0 px-5 py-3 border-b border-slate-100">
          <EvidenceAIPanel
            title={title}
            summary={summary}
            methodology={methodology}
            conclusions={conclusions}
            pack={{ version: 2, artifacts }}
            onApplySummary={(s) => {
              setSummary(s);
              setDirty(true);
            }}
            onApplyMethodology={(m) => {
              setMethodology(m);
              setShowInterp(true);
              setDirty(true);
            }}
            onApplyConclusions={(c) => {
              setConclusions(c);
              setShowInterp(true);
              setDirty(true);
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                filter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              All ({artifacts.length})
            </button>
            {(Object.keys(ARTIFACT_META) as ArtifactKind[]).map((k) => {
              const n = artifacts.filter((a) => a.kind === k).length;
              if (!n) return null;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                    filter === k
                      ? 'bg-sky-800 text-white border-sky-800'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {ARTIFACT_META[k].short} ({n})
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-14 px-6 text-center">
              <FolderIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-[14px] font-medium text-slate-800">Start with raw data</p>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
                Add a datasheet (or import Excel), then a summary table and figure, then write the
                text result that ties them together.
              </p>
              <button
                type="button"
                onClick={() => setEditor({ mode: 'create', kind: 'sheet' })}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-700 text-white text-[13px] font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Add datasheet
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((a) => {
                const Icon = KIND_ICON[a.kind];
                const filled = artifactHasContent(a);
                return (
                  <li
                    key={a.id}
                    className="group flex items-stretch rounded-xl border border-slate-200 bg-white hover:border-sky-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setEditor({ mode: 'edit', artifact: a })}
                      className="flex-1 flex items-center gap-3 px-3.5 py-3 text-left min-w-0"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-sky-800 border border-slate-100 shrink-0">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-slate-900 truncate">
                            {a.name || ARTIFACT_META[a.kind].label}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {ARTIFACT_META[a.kind].short}
                          </span>
                          {!filled && (
                            <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                              incomplete
                            </span>
                          )}
                        </span>
                        <span className="block text-[12px] text-slate-500 truncate mt-0.5">
                          {previewLine(a)}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center pr-2 gap-0.5">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => setEditor({ mode: 'edit', artifact: a })}
                        className="p-2 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => removeArtifact(a.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="pt-2">
            {!showInterp ? (
              <button
                type="button"
                onClick={() => setShowInterp(true)}
                className="text-[13px] font-medium text-sky-800 hover:underline"
              >
                + Pack methods & overall conclusions
              </button>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
                <p className="text-[12px] font-semibold text-slate-800">Pack-level notes</p>
                <div>
                  <label className="text-[12px] text-slate-500">Methods (how this pack was produced)</label>
                  <textarea
                    value={methodology}
                    onChange={(e) => {
                      setMethodology(e.target.value);
                      setDirty(true);
                    }}
                    rows={2}
                    className="mt-1 w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2"
                    placeholder="Assay protocol, analysis pipeline, software versions…"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-slate-500">Overall conclusions</label>
                  <textarea
                    value={conclusions}
                    onChange={(e) => {
                      setConclusions(e.target.value);
                      setDirty(true);
                    }}
                    rows={2}
                    className="mt-1 w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2"
                    placeholder="What this pack supports as a whole…"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {onDeletePack && (
              <button
                type="button"
                onClick={onDeletePack}
                className="text-[13px] font-medium text-rose-600 hover:bg-rose-50 px-2 py-2 rounded-lg"
              >
                Delete pack
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowReview(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-teal-900 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100"
            >
              <EyeIcon className="w-4 h-4" />
              Review
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[13px] font-medium text-slate-600 border border-slate-200 rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isSaving || !dirty}
              onClick={() => void persist()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg disabled:opacity-40"
            >
              <CheckIcon className="w-4 h-4" />
              {isSaving ? 'Saving…' : dirty ? 'Save pack' : 'Saved'}
            </button>
          </div>
        </div>
      </aside>

      {editor?.mode === 'create' && (
        <ArtifactEditorHost
          artifact={null}
          createKind={editor.kind}
          packArtifacts={artifacts}
          onCancel={() => setEditor(null)}
          onSave={saveArtifact}
        />
      )}
      {editor?.mode === 'edit' && (
        <ArtifactEditorHost
          artifact={editor.artifact}
          packArtifacts={artifacts}
          onCancel={() => setEditor(null)}
          onSave={saveArtifact}
        />
      )}
      {showReview && (
        <PackReviewView
          entry={{
            id: entry.id,
            title,
            summary,
            status: entry.status,
            type: entry.type,
            category: entry.category,
            author: entry.author,
            date: entry.date,
            tags: entry.tags,
            methodology,
            conclusions,
            protocolId: entry.protocolId,
            experimentId: entry.experimentId,
            notebookEntryId: entry.notebookEntryId,
          }}
          pack={{ version: 2, artifacts }}
          onClose={() => setShowReview(false)}
          onEdit={() => setShowReview(false)}
          onUpdateArtifact={(next) => {
            setArtifacts((prev) => prev.map((a) => (a.id === next.id ? next : a)));
            setDirty(true);
          }}
          onUpdateEntry={(patch) => {
            if (patch.title != null) setTitle(patch.title);
            if (patch.summary != null) setSummary(patch.summary);
            if (patch.methodology != null) setMethodology(patch.methodology);
            if (patch.conclusions != null) setConclusions(patch.conclusions);
            setDirty(true);
          }}
        />
      )}
    </div>
  );
};

export default EvidencePackWorkspace;
