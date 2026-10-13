import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SpreadsheetGrid from './SpreadsheetGrid';
import SheetQuickChart from './SheetQuickChart';
import ResultAnalysisPanel from './ResultAnalysisPanel';
import {
  ArrowLeftIcon,
  ChartBarIcon,
  CheckIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  EditIcon,
  PhotoIcon,
  TableCellsIcon,
  TrashIcon,
} from '../icons';
import {
  DataSheetArtifact,
  EvidencePackData,
  FigureArtifact,
  PackArtifact,
  SummaryTableArtifact,
  artifactHasContent,
  createEmptyArtifact,
  newArtifactId,
  touchArtifact,
} from '../../utils/evidencePack';
import { importSpreadsheetFile } from '../../utils/spreadsheet';

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
  backHref: string;
  backLabel?: string;
  experimentTitle?: string | null;
  onSavePack: (patch: {
    title: string;
    summary: string;
    methodology: string;
    conclusions: string;
    pack: EvidencePackData;
  }) => void | Promise<void>;
  onDeletePack?: () => void;
};

type ResultKind = 'sheet' | 'table' | 'image';
type Mode =
  | { kind: 'home' }
  | { kind: 'edit'; id: string }
  | { kind: 'view'; id: string }
  | { kind: 'analyze'; id: string };

const ENTRY_CARDS: {
  kind: ResultKind | 'upload';
  title: string;
  blurb: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}[] = [
  {
    kind: 'sheet',
    title: 'Spreadsheet',
    blurb: 'Type or paste numbers in a grid — like Excel.',
    icon: TableCellsIcon,
  },
  {
    kind: 'table',
    title: 'Summary table',
    blurb: 'A small table for means, n, or p-values — like Word.',
    icon: TableCellsIcon,
  },
  {
    kind: 'image',
    title: 'Figure',
    blurb: 'Add a gel, blot, plot, or photo with a caption.',
    icon: PhotoIcon,
  },
  {
    kind: 'upload',
    title: 'Upload file',
    blurb: 'Import an Excel or CSV file as a spreadsheet.',
    icon: DocumentArrowUpIcon,
  },
];

function kindLabel(kind: string): string {
  if (kind === 'sheet') return 'Spreadsheet';
  if (kind === 'table') return 'Summary table';
  if (kind === 'image') return 'Figure';
  return 'Result';
}

function previewLine(a: PackArtifact): string {
  if (a.kind === 'sheet') {
    const s = a as DataSheetArtifact;
    const filled = s.rows.filter((r) => r.some((c) => String(c).trim())).length;
    return `${s.headers.length} columns · ${filled} rows with data`;
  }
  if (a.kind === 'table') {
    const t = a as SummaryTableArtifact;
    return `${t.columns.length} columns · ${t.rows.length} rows`;
  }
  if (a.kind === 'image') {
    const f = a as FigureArtifact;
    return f.title || f.fileName || 'No caption yet';
  }
  return '';
}

/**
 * Results hub: four clear ways to add data, then View / Edit on what you saved.
 */
const EvidencePackWorkspace: React.FC<Props> = ({
  entry,
  pack: initialPack,
  isSaving,
  backHref,
  backLabel = 'Back',
  experimentTitle,
  onSavePack,
  onDeletePack,
}) => {
  const [title, setTitle] = useState(entry.title);
  const [summary, setSummary] = useState(entry.summary);
  const [artifacts, setArtifacts] = useState<PackArtifact[]>(() =>
    initialPack.artifacts.filter((a) => a.kind === 'sheet' || a.kind === 'table' || a.kind === 'image')
  );
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'home' });
  const [error, setError] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => artifacts.filter((a) => a.kind === 'sheet' || a.kind === 'table' || a.kind === 'image'),
    [artifacts]
  );

  const active = useMemo(() => {
    if (mode.kind === 'home') return null;
    return visible.find((a) => a.id === mode.id) || null;
  }, [mode, visible]);

  const markDirty = () => setDirty(true);

  const persist = async (nextArtifacts?: PackArtifact[]) => {
    const list = nextArtifacts ?? artifacts;
    await onSavePack({
      title: title.trim() || entry.title,
      summary: summary.trim() || title.trim(),
      methodology: entry.methodology || '',
      conclusions: entry.conclusions || '',
      pack: { version: 2, artifacts: list },
    });
    setDirty(false);
  };

  const updateActive = (next: PackArtifact) => {
    setArtifacts((prev) => prev.map((a) => (a.id === next.id ? touchArtifact(next) : a)));
    markDirty();
  };

  const startNew = (kind: ResultKind) => {
    const count = artifacts.filter((a) => a.kind === kind).length + 1;
    const name =
      kind === 'sheet'
        ? `Spreadsheet ${count}`
        : kind === 'table'
          ? `Table ${count}`
          : `Figure ${count}`;
    const created = createEmptyArtifact(kind, name);
    setArtifacts((prev) => [...prev, created]);
    setMode({ kind: 'edit', id: created.id });
    markDirty();
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const imported = await importSpreadsheetFile(file);
      const created = createEmptyArtifact(
        'sheet',
        file.name.replace(/\.[^.]+$/, '') || 'Uploaded sheet'
      ) as DataSheetArtifact;
      const sheet: DataSheetArtifact = {
        ...created,
        fileName: imported.fileName,
        headers: imported.headers,
        rows: imported.rows,
        columnMeta: imported.headers.map((h) => ({ header: h, type: 'text' as const })),
      };
      setArtifacts((prev) => [...prev, sheet]);
      setMode({ kind: 'edit', id: sheet.id });
      markDirty();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import file');
    }
  };

  const removeArtifact = async (id: string) => {
    if (!confirm('Remove this result?')) return;
    const next = artifacts.filter((a) => a.id !== id);
    setArtifacts(next);
    if (mode.kind !== 'home' && mode.id === id) setMode({ kind: 'home' });
    markDirty();
    try {
      await persist(next);
    } catch {
      /* parent shows error */
    }
  };

  const doneEditing = async () => {
    try {
      await persist();
      setMode({ kind: 'home' });
    } catch {
      /* keep editor open */
    }
  };

  const onPickFigure = async (artifact: FigureArtifact, file: File | null) => {
    if (!file) return;
    const previewUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    updateActive({
      ...artifact,
      fileName: file.name,
      mimeType: file.type || 'image/*',
      size: file.size,
      previewUrl,
      title: artifact.title || file.name.replace(/\.[^.]+$/, ''),
      name: artifact.name.startsWith('Figure')
        ? file.name.replace(/\.[^.]+$/, '')
        : artifact.name,
    });
  };

  /* ─── Editor / viewer / analyze for one result ─── */
  if (mode.kind !== 'home' && active) {
    const editing = mode.kind === 'edit';
    const analyzing = mode.kind === 'analyze';
    const sheetHeaders =
      active.kind === 'sheet'
        ? (active as DataSheetArtifact).headers
        : active.kind === 'table'
          ? (active as SummaryTableArtifact).columns.map((c) => c.header)
          : [];
    const sheetRows =
      active.kind === 'sheet'
        ? (active as DataSheetArtifact).rows
        : active.kind === 'table'
          ? (active as SummaryTableArtifact).rows
          : [];
    const canAnalyze = active.kind === 'sheet' || active.kind === 'table';

    return (
      <div className="relative max-w-7xl mx-auto pb-16 px-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-4 h-48 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.07),_transparent_60%)]"
        />
        <div className="relative">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (editing && dirty && !confirm('Leave without saving this result?')) return;
                setMode({ kind: 'home' });
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              All results on this page
            </button>
            <span className="text-slate-300">·</span>
            <span className="text-[13px] text-slate-500">
              {analyzing ? 'Analyze' : kindLabel(active.kind)}
            </span>
            <div className="flex-1" />
            {canAnalyze && !analyzing && (
              <button
                type="button"
                onClick={() => setMode({ kind: 'analyze', id: active.id })}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-sky-900 border border-sky-200 bg-sky-50 rounded-md hover:bg-sky-100"
              >
                <ChartBarIcon className="w-4 h-4" />
                Analyze
              </button>
            )}
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode({ kind: 'view', id: active.id })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  <EyeIcon className="w-4 h-4" />
                  Preview
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void doneEditing()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-md hover:bg-sky-800 disabled:opacity-40"
                >
                  <CheckIcon className="w-4 h-4" />
                  {isSaving ? 'Saving…' : 'Save to page'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMode({ kind: 'edit', id: active.id })}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                <EditIcon className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>

          {analyzing && canAnalyze ? (
            <div className="space-y-6">
              <ResultAnalysisPanel
                headers={sheetHeaders}
                rows={sheetRows}
                resultName={active.name}
                experimentId={entry.experimentId}
                resultId={entry.id}
              />
              <div className="rounded-xl border border-slate-200 bg-white p-4 opacity-90">
                <p className="text-[12px] font-medium text-slate-500 mb-2">Data preview</p>
                <div className="pointer-events-none max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <SpreadsheetGrid
                    headers={sheetHeaders}
                    rows={sheetRows}
                    onChange={() => undefined}
                    minRows={4}
                    minCols={4}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
          <input
            value={active.name}
            disabled={!editing}
            onChange={(e) => updateActive({ ...active, name: e.target.value })}
            className="w-full mb-6 text-[1.5rem] font-semibold text-slate-900 bg-transparent border-0 border-b border-slate-200 focus:border-sky-400 focus:outline-none py-1 disabled:border-transparent"
            placeholder="Name this result"
          />

          {active.kind === 'sheet' && (
            <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.85fr)] gap-6 items-start">
              <div className="space-y-3 min-w-0">
                {editing && (
                  <p className="text-[13px] text-slate-500">
                    Enter data in the grid, or paste from Excel with ⌘V / Ctrl+V.
                  </p>
                )}
                <div
                  className={`rounded-xl border border-slate-300 shadow-sm overflow-hidden bg-white ${
                    !editing ? 'pointer-events-none opacity-95' : ''
                  }`}
                >
                  <SpreadsheetGrid
                    headers={(active as DataSheetArtifact).headers}
                    rows={(active as DataSheetArtifact).rows}
                    onChange={({ headers, rows }) => {
                      if (!editing) return;
                      const sheet = active as DataSheetArtifact;
                      updateActive({
                        ...sheet,
                        headers,
                        rows,
                        columnMeta: headers.map((h, i) => ({
                          header: h,
                          type: sheet.columnMeta[i]?.type || 'text',
                          unit: sheet.columnMeta[i]?.unit,
                        })),
                      });
                    }}
                    minRows={14}
                    minCols={8}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 min-h-[280px]">
                <SheetQuickChart
                  headers={(active as DataSheetArtifact).headers}
                  rows={(active as DataSheetArtifact).rows}
                  title={active.name}
                />
              </div>
            </div>
          )}

          {active.kind === 'table' && (
            <div className="max-w-5xl space-y-3">
              {editing && (
                <p className="text-[13px] text-slate-500">
                  Build a compact summary table (for papers or slides).
                </p>
              )}
              <p className="text-[13px] italic text-slate-600">{active.name}</p>
              <div
                className={`rounded-xl border border-slate-300 shadow-sm overflow-hidden bg-white ${
                  !editing ? 'pointer-events-none' : ''
                }`}
              >
                <SpreadsheetGrid
                  headers={(active as SummaryTableArtifact).columns.map((c) => c.header)}
                  rows={(active as SummaryTableArtifact).rows}
                  onChange={({ headers, rows }) => {
                    if (!editing) return;
                    const table = active as SummaryTableArtifact;
                    updateActive({
                      ...table,
                      columns: headers.map((header, i) => ({
                        id: table.columns[i]?.id || newArtifactId(),
                        header,
                        type: table.columns[i]?.type || 'text',
                        unit: table.columns[i]?.unit,
                        decimals: table.columns[i]?.decimals,
                      })),
                      rows,
                    });
                  }}
                  minRows={6}
                  minCols={5}
                />
              </div>
              <input
                value={(active as SummaryTableArtifact).footnotes}
                disabled={!editing}
                onChange={(e) =>
                  updateActive({
                    ...(active as SummaryTableArtifact),
                    footnotes: e.target.value,
                  })
                }
                className="w-full text-[12px] text-slate-500 bg-transparent border-0 focus:outline-none disabled:opacity-80"
                placeholder="Footnote (optional)"
              />
            </div>
          )}

          {active.kind === 'image' && (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
              <button
                type="button"
                disabled={!editing}
                onClick={() => editing && imageRef.current?.click()}
                className="w-full flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-slate-300 bg-white shadow-sm disabled:cursor-default overflow-hidden"
              >
                {(active as FigureArtifact).previewUrl ? (
                  <img
                    src={(active as FigureArtifact).previewUrl}
                    alt=""
                    className="max-h-[520px] max-w-full object-contain"
                  />
                ) : (
                  <span className="py-20 text-[13px] text-slate-400 font-medium">
                    {editing ? 'Click to add an image' : 'No image'}
                  </span>
                )}
              </button>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void onPickFigure(active as FigureArtifact, e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Caption
                </p>
                <input
                  value={(active as FigureArtifact).title}
                  disabled={!editing}
                  onChange={(e) =>
                    updateActive({ ...(active as FigureArtifact), title: e.target.value })
                  }
                  className="w-full text-[14px] font-medium border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:border-transparent disabled:bg-slate-50"
                  placeholder="Figure title"
                />
                <textarea
                  value={(active as FigureArtifact).legend}
                  disabled={!editing}
                  onChange={(e) =>
                    updateActive({ ...(active as FigureArtifact), legend: e.target.value })
                  }
                  rows={5}
                  className="w-full text-[13px] text-slate-600 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:border-transparent disabled:bg-slate-50"
                  placeholder="Legend (optional)"
                />
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Home: four buttons + saved list ─── */
  return (
    <div className="relative max-w-7xl mx-auto pb-16 px-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-4 h-56 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.08),_transparent_55%)]"
      />

      <div className="relative">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          <Link to={backHref} className="font-medium text-slate-600 hover:text-slate-900">
            ← {backLabel}
          </Link>
          {entry.experimentId && (
            <>
              <span className="text-slate-300">·</span>
              <Link
                to={`/experiments/${encodeURIComponent(entry.experimentId)}`}
                className="font-medium text-slate-800 hover:underline"
              >
                {experimentTitle || 'Experiment'}
              </Link>
              <span className="text-slate-300">·</span>
              <span>Results</span>
            </>
          )}
        </div>

        <header className="mb-10 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm px-6 py-6 sm:px-8 sm:py-7 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start gap-5 justify-between">
            <div className="min-w-0 flex-1 max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/80 mb-2">
                Results page
              </p>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                className="w-full text-[1.85rem] sm:text-[2rem] font-semibold tracking-tight text-slate-900 bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-sky-400 focus:outline-none py-1"
                placeholder="Name this results page"
              />
              <input
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value);
                  markDirty();
                }}
                className="mt-3 w-full text-[15px] text-slate-600 bg-transparent border-0 focus:outline-none"
                placeholder="What experiment or analysis is this for?"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              {onDeletePack && (
                <button
                  type="button"
                  onClick={onDeletePack}
                  className="text-[13px] font-medium text-rose-600 px-3 py-2 rounded-md hover:bg-rose-50"
                >
                  Delete page
                </button>
              )}
              <button
                type="button"
                disabled={isSaving || !dirty}
                onClick={() => void persist()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-md disabled:opacity-40"
              >
                <CheckIcon className="w-4 h-4" />
                {isSaving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        <section className="mb-12">
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold text-slate-900">Add results</h2>
            <p className="text-[14px] text-slate-500 mt-1 max-w-2xl">
              Choose how your data looks. You can add as many as you need — each one is saved on
              this page.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {ENTRY_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.kind}
                  type="button"
                  onClick={() => {
                    if (card.kind === 'upload') uploadRef.current?.click();
                    else startNew(card.kind);
                  }}
                  className="group text-left rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm hover:border-sky-300 hover:shadow-md hover:bg-gradient-to-br hover:from-white hover:to-sky-50/50 transition-all"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-800 mb-4 transition-colors">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="block text-[15px] font-semibold text-slate-900">{card.title}</span>
                  <span className="block text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                    {card.blurb}
                  </span>
                </button>
              );
            })}
          </div>
          <input
            ref={uploadRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => {
              void handleUpload(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[17px] font-semibold text-slate-900">Saved on this page</h2>
              <p className="text-[14px] text-slate-500 mt-1">
                {visible.length === 0
                  ? 'Nothing saved yet — use a button above to start.'
                  : `${visible.length} result${visible.length === 1 ? '' : 's'}. View or edit anytime.`}
              </p>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center text-[14px] text-slate-500">
              Your spreadsheets, tables, and figures will appear here.
            </div>
          ) : (
            <ul className="grid md:grid-cols-2 gap-3">
              {visible.map((a) => {
                const filled = artifactHasContent(a);
                return (
                  <li
                    key={a.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-slate-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {kindLabel(a.kind)}
                        </span>
                        {!filled && (
                          <span className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                            Incomplete
                          </span>
                        )}
                      </div>
                      <p className="text-[15px] font-medium text-slate-900 truncate mt-1">
                        {a.name || kindLabel(a.kind)}
                      </p>
                      <p className="text-[12px] text-slate-500 truncate mt-0.5">{previewLine(a)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'view', id: a.id })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                      >
                        <EyeIcon className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'edit', id: a.id })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      {(a.kind === 'sheet' || a.kind === 'table') && (
                        <button
                          type="button"
                          onClick={() => setMode({ kind: 'analyze', id: a.id })}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-sky-900 border border-sky-200 bg-sky-50 rounded-md hover:bg-sky-100"
                        >
                          <ChartBarIcon className="w-3.5 h-3.5" />
                          Analyze
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeArtifact(a.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50"
                        aria-label="Remove"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default EvidencePackWorkspace;
