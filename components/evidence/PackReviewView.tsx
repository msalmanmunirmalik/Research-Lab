import React, { useMemo, useRef } from 'react';
import LinkedEntityChips, { buildWorkflowLinks } from '../LinkedEntityChips';
import SpreadsheetGrid from './SpreadsheetGrid';
import XyTrendChart from './XyTrendChart';
import {
  ARTIFACT_META,
  ArtifactKind,
  EvidencePackData,
  PackArtifact,
  ResultPolarity,
  artifactHasContent,
  newArtifactId,
  summarizePack,
} from '../../utils/evidencePack';
import { resolveMatrixFormulas, displayCellValue } from '../../utils/sheetFormulas';
import {
  DocumentTextIcon,
  FilesIcon,
  PhotoIcon,
  TableCellsIcon,
  XMarkIcon,
  PrinterIcon,
} from '../icons';

export type PackReviewEntry = {
  id: string;
  title: string;
  summary: string;
  status: string;
  type: string;
  category: string;
  author?: string;
  date?: string | Date;
  methodology?: string;
  conclusions?: string;
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
  tags?: string[];
};

type Props = {
  entry: PackReviewEntry;
  pack: EvidencePackData;
  onClose: () => void;
  onEdit?: () => void;
  /** Live-edit artifacts (tables, text, sheets) — chart updates immediately. */
  onUpdateArtifact?: (artifact: PackArtifact) => void;
  onUpdateEntry?: (
    patch: Partial<Pick<PackReviewEntry, 'title' | 'summary' | 'methodology' | 'conclusions'>>
  ) => void;
};

const KIND_ICON: Record<ArtifactKind, React.FC<React.SVGProps<SVGSVGElement>>> = {
  text: DocumentTextIcon,
  table: TableCellsIcon,
  sheet: FilesIcon,
  image: PhotoIcon,
};

const POLARITY_LABEL: Record<string, string> = {
  positive: 'Positive',
  negative: 'Negative',
  mixed: 'Mixed',
  inconclusive: 'Inconclusive',
  not_applicable: '',
};

function formatDate(d?: string | Date) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function MatrixTable({
  headers,
  rows,
  maxRows = 40,
  compact = false,
}: {
  headers: string[];
  rows: string[][];
  maxRows?: number;
  compact?: boolean;
}) {
  const resolved = resolveMatrixFormulas(headers, rows);
  const shown = resolved.rows.slice(0, maxRows);
  const hidden = Math.max(0, resolved.rows.length - shown.length);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={`min-w-full border-collapse ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        <thead>
          <tr className="bg-slate-50">
            {resolved.headers.map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap"
              >
                {h || `Col ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, ri) => (
            <tr key={ri} className={ri % 2 ? 'bg-slate-50/40' : 'bg-white'}>
              {resolved.headers.map((_, ci) => {
                const raw = rows[ri]?.[ci] ?? '';
                const { display, formula } = displayCellValue(raw, ri, headers, rows);
                return (
                  <td
                    key={ci}
                    title={formula || undefined}
                    className={`px-3 py-1.5 border-b border-slate-100 tabular-nums ${
                      formula ? 'text-teal-900 font-medium' : 'text-slate-800'
                    }`}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/80">
          Showing first {maxRows} of {resolved.rows.length} rows
        </p>
      )}
    </div>
  );
}

/**
 * Pack review — one-page presentation with live table/text editing
 * so charts update in real time. Print / PDF hides edit chrome.
 */
const PackReviewView: React.FC<Props> = ({
  entry,
  pack,
  onClose,
  onEdit,
  onUpdateArtifact,
  onUpdateEntry,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const editable = Boolean(onUpdateArtifact);
  const artifacts = pack.artifacts.filter(artifactHasContent);

  const byKind = useMemo(() => {
    const groups: Record<ArtifactKind, PackArtifact[]> = {
      image: [],
      table: [],
      text: [],
      sheet: [],
    };
    artifacts.forEach((a) => groups[a.kind].push(a));
    return groups;
  }, [artifacts]);

  const sections: { id: string; label: string; count: number }[] = [
    { id: 'figures', label: 'Figures', count: byKind.image.length },
    { id: 'tables', label: 'Tables', count: byKind.table.length },
    { id: 'results', label: 'Results', count: byKind.text.length },
    { id: 'sheets', label: 'Datasheets', count: byKind.sheet.length },
  ].filter((s) => s.count > 0);

  const dateLabel = formatDate(entry.date);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100/95 print:relative print:inset-auto print:bg-white">
      {/* Chrome — hidden when printing */}
      <div className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pack review{editable ? ' · live edit' : ''}
          </p>
          <p className="text-[14px] font-semibold text-slate-900 truncate">{entry.title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Back to edit
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <PrinterIcon className="w-4 h-4" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close review"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div
          ref={printRef}
          className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10 print:max-w-none print:px-0 print:py-0"
        >
          {/* Cover */}
          <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white shadow-xl print:shadow-none print:border print:border-slate-300 print:bg-white print:text-slate-900 print:rounded-none">
            <div className="absolute inset-0 opacity-30 print:hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-400/40 via-transparent to-transparent" />
            <div className="relative px-6 sm:px-10 py-10 sm:py-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/90 print:text-slate-500">
                Data & Results pack
              </p>
              {onUpdateEntry ? (
                <input
                  value={entry.title}
                  onChange={(e) => onUpdateEntry({ title: e.target.value })}
                  className="mt-3 w-full bg-transparent text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-white placeholder:text-white/40 border-b border-white/20 focus:border-sky-300 outline-none print:border-0 print:text-slate-900"
                  placeholder="Untitled pack"
                />
              ) : (
                <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                  {entry.title || 'Untitled pack'}
                </h1>
              )}
              {onUpdateEntry ? (
                <textarea
                  value={entry.summary}
                  onChange={(e) => onUpdateEntry({ summary: e.target.value })}
                  rows={2}
                  className="mt-4 max-w-2xl w-full bg-transparent text-[15px] leading-relaxed text-slate-200 placeholder:text-slate-400 border border-white/15 rounded-xl px-3 py-2 focus:border-sky-300 outline-none resize-y print:border-0 print:text-slate-600 print:p-0"
                  placeholder="One-sentence summary of the finding"
                />
              ) : (
                entry.summary && (
                  <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-200 print:text-slate-600">
                    {entry.summary}
                  </p>
                )
              )}
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-slate-300 print:text-slate-500">
                <span className="capitalize">
                  {String(entry.status || 'draft').replace(/_/g, ' ')}
                </span>
                {dateLabel && <span>{dateLabel}</span>}
                {entry.author && <span>{entry.author}</span>}
                <span className="capitalize">{formatLabel(entry.category)}</span>
                <span>{summarizePack(pack.artifacts)}</span>
              </div>
              {(entry.tags || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {entry.tags!.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-medium text-sky-100 print:bg-slate-100 print:text-slate-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-5 print:hidden">
                <LinkedEntityChips
                  links={buildWorkflowLinks({
                    protocolId: entry.protocolId,
                    experimentId: entry.experimentId,
                    notebookEntryId: entry.notebookEntryId,
                  })}
                />
              </div>
            </div>
          </header>

          {/* Jump nav */}
          {sections.length > 0 && (
            <nav className="mt-6 flex flex-wrap gap-2 print:hidden">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#review-${s.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-sky-300 hover:text-sky-900 shadow-sm"
                >
                  {s.label}
                  <span className="text-slate-400">{s.count}</span>
                </a>
              ))}
              {(entry.methodology || entry.conclusions) && (
                <a
                  href="#review-notes"
                  className="inline-flex items-center px-3 py-1.5 rounded-full border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-sky-300 shadow-sm"
                >
                  Methods & conclusions
                </a>
              )}
            </nav>
          )}

          {artifacts.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <p className="text-[15px] font-medium text-slate-800">Nothing to review yet</p>
              <p className="mt-1 text-[13px] text-slate-500">
                Add a datasheet, table, figure, or text result, then open review again.
              </p>
            </div>
          ) : (
            <div className="mt-10 space-y-14">
              {/* Figures */}
              {byKind.image.length > 0 && (
                <section id="review-figures" className="scroll-mt-8">
                  <SectionHeading kind="image" label="Figures" count={byKind.image.length} />
                  <div className="mt-5 space-y-8">
                    {byKind.image.map((a, idx) =>
                      a.kind === 'image' ? (
                        <figure
                          key={a.id}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm print:shadow-none"
                        >
                          <div className="bg-slate-950/95 flex items-center justify-center min-h-[200px] print:bg-slate-100">
                            {a.previewUrl ? (
                              <img
                                src={a.previewUrl}
                                alt={a.title || a.name}
                                className="max-h-[min(70vh,640px)] max-w-full object-contain"
                              />
                            ) : (
                              <p className="text-slate-400 text-[13px] py-16">No image preview</p>
                            )}
                          </div>
                          <figcaption className="px-5 py-4 border-t border-slate-100">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                              Figure {idx + 1}
                              {a.modality && a.modality !== 'other' ? ` · ${a.modality}` : ''}
                            </p>
                            <p className="mt-1 text-[15px] font-semibold text-slate-900">
                              {a.title || a.name}
                            </p>
                            {a.legend && (
                              <p className="mt-2 text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                                {a.legend}
                              </p>
                            )}
                            {a.scaleNote && (
                              <p className="mt-2 text-[12px] text-slate-500">Scale: {a.scaleNote}</p>
                            )}
                          </figcaption>
                        </figure>
                      ) : null
                    )}
                  </div>
                </section>
              )}

              {/* Tables */}
              {byKind.table.length > 0 && (
                <section id="review-tables" className="scroll-mt-8">
                  <SectionHeading kind="table" label="Summary tables" count={byKind.table.length} />
                  <div className="mt-5 space-y-10">
                    {byKind.table.map((a, idx) =>
                      a.kind === 'table' ? (
                        <div key={a.id} className="space-y-3">
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Table {idx + 1}
                                {editable ? ' · editable' : ''}
                              </p>
                              {editable ? (
                                <input
                                  value={a.name}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, name: e.target.value })
                                  }
                                  className="mt-0.5 w-full text-[16px] font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-sky-400 outline-none"
                                />
                              ) : (
                                <h3 className="text-[16px] font-semibold text-slate-900">{a.name}</h3>
                              )}
                            </div>
                          </div>

                          {editable ? (
                            <div className="print:hidden">
                              <SpreadsheetGrid
                                headers={a.columns.map((c) => c.header)}
                                rows={a.rows}
                                minRows={Math.max(4, a.rows.length)}
                                minCols={Math.max(3, a.columns.length)}
                                onChange={({ headers, rows }) => {
                                  const columns = headers.map((h, i) => {
                                    const prev = a.columns[i];
                                    if (prev) return { ...prev, header: h };
                                    return {
                                      id: newArtifactId(),
                                      header: h || `Col ${i + 1}`,
                                      type: 'number' as const,
                                    };
                                  });
                                  onUpdateArtifact!({ ...a, columns, rows });
                                }}
                              />
                            </div>
                          ) : null}
                          <div className={editable ? 'hidden print:block' : ''}>
                            <MatrixTable
                              headers={a.columns.map((c) =>
                                c.unit ? `${c.header} (${c.unit})` : c.header
                              )}
                              rows={a.rows}
                              maxRows={60}
                            />
                          </div>

                          {editable ? (
                            <textarea
                              value={a.footnotes}
                              onChange={(e) =>
                                onUpdateArtifact!({ ...a, footnotes: e.target.value })
                              }
                              rows={2}
                              placeholder="Footnotes"
                              className="w-full text-[12px] text-slate-600 italic rounded-xl border border-slate-200 px-3 py-2 bg-white print:border-0 print:p-0"
                            />
                          ) : (
                            a.footnotes && (
                              <p className="text-[12px] text-slate-500 italic whitespace-pre-wrap">
                                {a.footnotes}
                              </p>
                            )
                          )}

                          <XyTrendChart
                            headers={a.columns.map((c) => c.header)}
                            rows={a.rows}
                            title={`Figure · ${a.name}`}
                            height={280}
                            className="print:break-inside-avoid"
                          />
                        </div>
                      ) : null
                    )}
                  </div>
                </section>
              )}

              {/* Text results */}
              {byKind.text.length > 0 && (
                <section id="review-results" className="scroll-mt-8">
                  <SectionHeading kind="text" label="Results & claims" count={byKind.text.length} />
                  <div className="mt-5 space-y-5">
                    {byKind.text.map((a) =>
                      a.kind === 'text' ? (
                        <article
                          key={a.id}
                          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm print:shadow-none"
                        >
                          {editable ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2 items-center">
                                <input
                                  value={a.name}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, name: e.target.value })
                                  }
                                  className="flex-1 min-w-[10rem] text-[15px] font-semibold text-slate-900 bg-transparent border-b border-slate-200 focus:border-sky-500 outline-none"
                                  placeholder="Result title"
                                />
                                <select
                                  value={a.polarity}
                                  onChange={(e) =>
                                    onUpdateArtifact!({
                                      ...a,
                                      polarity: e.target.value as ResultPolarity,
                                    })
                                  }
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] text-slate-700"
                                >
                                  {(
                                    [
                                      'positive',
                                      'negative',
                                      'mixed',
                                      'inconclusive',
                                      'not_applicable',
                                    ] as ResultPolarity[]
                                  ).map((p) => (
                                    <option key={p} value={p}>
                                      {POLARITY_LABEL[p] || 'N/A'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="block">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Finding
                                </span>
                                <textarea
                                  value={a.finding}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, finding: e.target.value })
                                  }
                                  rows={2}
                                  className="mt-1 w-full text-[15px] font-medium text-slate-900 border-l-2 border-sky-600 pl-3 bg-transparent outline-none resize-y"
                                  placeholder="Main claim"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Evidence
                                </span>
                                <textarea
                                  value={a.evidence}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, evidence: e.target.value })
                                  }
                                  rows={3}
                                  className="mt-1 w-full text-[13px] text-slate-700 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-400 resize-y"
                                  placeholder="Supporting evidence"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80">
                                  Caveats
                                </span>
                                <textarea
                                  value={a.caveats}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, caveats: e.target.value })
                                  }
                                  rows={2}
                                  className="mt-1 w-full text-[13px] text-amber-950/90 rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-2 outline-none resize-y"
                                  placeholder="Limitations"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Notes
                                </span>
                                <textarea
                                  value={a.body}
                                  onChange={(e) =>
                                    onUpdateArtifact!({ ...a, body: e.target.value })
                                  }
                                  rows={2}
                                  className="mt-1 w-full text-[13px] text-slate-600 rounded-xl border border-slate-200 px-3 py-2 outline-none resize-y"
                                  placeholder="Additional notes"
                                />
                              </label>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[15px] font-semibold text-slate-900">{a.name}</h3>
                                {POLARITY_LABEL[a.polarity] && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
                                    {POLARITY_LABEL[a.polarity]}
                                  </span>
                                )}
                              </div>
                              {a.finding && (
                                <p className="mt-3 text-[16px] leading-snug text-slate-900 font-medium border-l-2 border-sky-600 pl-3">
                                  {a.finding}
                                </p>
                              )}
                              {a.evidence && (
                                <div className="mt-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Evidence
                                  </p>
                                  <p className="mt-1 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    {a.evidence}
                                  </p>
                                </div>
                              )}
                              {a.caveats && (
                                <div className="mt-4 rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-2.5">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80">
                                    Caveats
                                  </p>
                                  <p className="mt-1 text-[13px] text-amber-950/90 leading-relaxed whitespace-pre-wrap">
                                    {a.caveats}
                                  </p>
                                </div>
                              )}
                              {a.body && (
                                <p className="mt-4 text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                                  {a.body}
                                </p>
                              )}
                            </>
                          )}
                        </article>
                      ) : null
                    )}
                  </div>
                </section>
              )}

              {/* Datasheets */}
              {byKind.sheet.length > 0 && (
                <section id="review-sheets" className="scroll-mt-8">
                  <SectionHeading kind="sheet" label="Datasheets" count={byKind.sheet.length} />
                  <div className="mt-5 space-y-10">
                    {byKind.sheet.map((a) =>
                      a.kind === 'sheet' ? (
                        <div key={a.id} className="space-y-3">
                          <div>
                            {editable ? (
                              <input
                                value={a.name}
                                onChange={(e) =>
                                  onUpdateArtifact!({ ...a, name: e.target.value })
                                }
                                className="w-full text-[16px] font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-sky-400 outline-none"
                              />
                            ) : (
                              <h3 className="text-[16px] font-semibold text-slate-900">{a.name}</h3>
                            )}
                            <p className="mt-1 text-[12px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                              {a.assay && <span>{a.assay}</span>}
                              {a.collectedOn && <span>{a.collectedOn}</span>}
                              {a.operator && <span>{a.operator}</span>}
                              {a.instrument && <span>{a.instrument}</span>}
                              {a.fileName && (
                                <span className="font-mono text-[11px]">{a.fileName}</span>
                              )}
                              {editable && (
                                <span className="text-teal-800 font-medium">editable · chart live</span>
                              )}
                            </p>
                          </div>

                          {editable ? (
                            <div className="print:hidden">
                              <SpreadsheetGrid
                                headers={a.headers}
                                rows={a.rows}
                                minRows={Math.max(8, a.rows.length)}
                                minCols={Math.max(4, a.headers.length)}
                                onChange={({ headers, rows }) => {
                                  const columnMeta = headers.map((h, i) => ({
                                    header: h,
                                    type: a.columnMeta[i]?.type || 'text',
                                    unit: a.columnMeta[i]?.unit,
                                    required: a.columnMeta[i]?.required,
                                  }));
                                  onUpdateArtifact!({ ...a, headers, rows, columnMeta });
                                }}
                              />
                            </div>
                          ) : null}
                          <div className={editable ? 'hidden print:block' : ''}>
                            <MatrixTable headers={a.headers} rows={a.rows} maxRows={40} compact />
                          </div>

                          {editable ? (
                            <textarea
                              value={a.notes}
                              onChange={(e) =>
                                onUpdateArtifact!({ ...a, notes: e.target.value })
                              }
                              rows={2}
                              placeholder="Notes (QC, exclusions…)"
                              className="w-full text-[12px] text-slate-600 rounded-xl border border-slate-200 px-3 py-2 bg-white"
                            />
                          ) : (
                            a.notes && (
                              <p className="text-[12px] text-slate-500 whitespace-pre-wrap">{a.notes}</p>
                            )
                          )}

                          <XyTrendChart
                            headers={a.headers}
                            rows={a.rows}
                            title={`Figure · ${a.name}`}
                            height={280}
                            className="print:break-inside-avoid"
                          />
                        </div>
                      ) : null
                    )}
                  </div>
                </section>
              )}

              {/* Pack-level notes */}
              {(onUpdateEntry || entry.methodology || entry.conclusions) && (
                <section id="review-notes" className="scroll-mt-8">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Methods & conclusions
                  </h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {(onUpdateEntry || entry.methodology) && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Methods
                        </p>
                        {onUpdateEntry ? (
                          <textarea
                            value={entry.methodology || ''}
                            onChange={(e) => onUpdateEntry({ methodology: e.target.value })}
                            rows={5}
                            className="mt-2 w-full text-[13px] text-slate-700 leading-relaxed outline-none resize-y min-h-[6rem]"
                            placeholder="Methods / approach"
                          />
                        ) : (
                          <p className="mt-2 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {entry.methodology}
                          </p>
                        )}
                      </div>
                    )}
                    {(onUpdateEntry || entry.conclusions) && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Conclusions
                        </p>
                        {onUpdateEntry ? (
                          <textarea
                            value={entry.conclusions || ''}
                            onChange={(e) => onUpdateEntry({ conclusions: e.target.value })}
                            rows={5}
                            className="mt-2 w-full text-[13px] text-slate-700 leading-relaxed outline-none resize-y min-h-[6rem]"
                            placeholder="Conclusions"
                          />
                        ) : (
                          <p className="mt-2 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {entry.conclusions}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          <footer className="mt-14 pt-6 border-t border-slate-200 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2 print:mt-8">
            <span>RILOS · Evidence pack review</span>
            <span>{artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}</span>
          </footer>
        </div>
      </div>
    </div>
  );
};

function SectionHeading({
  kind,
  label,
  count,
}: {
  kind: ArtifactKind;
  label: string;
  count: number;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-800 border border-sky-100">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {ARTIFACT_META[kind].role}
          </p>
          <h2 className="text-[18px] font-semibold text-slate-900 tracking-tight">{label}</h2>
        </div>
      </div>
      <span className="text-[12px] text-slate-400 tabular-nums">{count}</span>
    </div>
  );
}

function formatLabel(value: string) {
  return String(value || '').replace(/_/g, ' ');
}

export default PackReviewView;
