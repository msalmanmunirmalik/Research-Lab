import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import SpreadsheetGrid from '../components/evidence/SpreadsheetGrid';
import { ChartBarIcon } from '../components/icons';
import {
  AnalysisKind,
  AnalysisReport,
  analyzeCompare,
  analyzeDescribe,
  analyzeRelate,
  categoricalColumns,
  checkAdvancedStatsHealth,
  numericColumns,
  sampleAnalysisMatrix,
} from '../utils/analysisEngine';
import { getAuthHeaders } from '../utils/apiBase';
import {
  DataSheetArtifact,
  loadPackFromMetadata,
  SummaryTableArtifact,
} from '../utils/evidencePack';
import { fmt, fmtP } from '../utils/researchStats';
import { importSpreadsheetFile } from '../utils/spreadsheet';

type DataSource = {
  id: string;
  label: string;
  headers: string[];
  rows: string[][];
  origin: 'experiment' | 'upload' | 'sample';
};

type ResultListItem = {
  id: string;
  title?: string;
  metadata?: unknown;
};

type VarMeta = { name: string; kind: 'numeric' | 'factor' | 'other' };

const ANALYSES: {
  id: AnalysisKind;
  label: string;
  short: string;
  test: string;
}[] = [
  { id: 'describe', label: 'Descriptives', short: 'Desc', test: 'Mean, SD, distribution' },
  { id: 'compare', label: 'Group comparison', short: 'Compare', test: 't-test / ANOVA' },
  { id: 'relate', label: 'Correlation', short: 'Relate', test: 'Pearson + linear fit' },
];

const ENGINE_LABEL: Record<string, string> = {
  scipy: 'SciPy',
  local: 'Local',
};

function filledRowCount(headers: string[], rows: string[][]): number {
  return rows.filter((r) => r.some((c) => String(c ?? '').trim())).length;
}

function parseMetadata(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function matrixFromArtifacts(
  resultId: string,
  resultTitle: string,
  metadata: unknown
): DataSource[] {
  const pack = loadPackFromMetadata(parseMetadata(metadata));
  const out: DataSource[] = [];
  for (const a of pack.artifacts) {
    if (a.kind === 'sheet') {
      const s = a as DataSheetArtifact;
      if (!s.headers?.length) continue;
      out.push({
        id: `${resultId}:${s.id}`,
        label: `${resultTitle} · ${s.name || s.fileName || 'Sheet'}`,
        headers: s.headers,
        rows: s.rows || [],
        origin: 'experiment',
      });
    } else if (a.kind === 'table') {
      const t = a as SummaryTableArtifact;
      const headers = (t.columns || []).map((c) => c.header || 'Col');
      if (!headers.length) continue;
      out.push({
        id: `${resultId}:${t.id}`,
        label: `${resultTitle} · ${t.name || 'Table'}`,
        headers,
        rows: t.rows || [],
        origin: 'experiment',
      });
    }
  }
  return out;
}

function buildFitLine(
  points: { x: number; y: number }[],
  slope: number,
  intercept: number
): { x: number; fit: number }[] {
  if (!points.length) return [];
  const xs = points.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return [
    { x: lo, fit: slope * lo + intercept },
    { x: hi, fit: slope * hi + intercept },
  ];
}

const DataAnalyticsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId') || '';
  const resultIdParam = searchParams.get('resultId') || '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [sources, setSources] = useState<DataSource[]>([]);
  const [activeId, setActiveId] = useState('');
  const [experimentTitle, setExperimentTitle] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [statsBackend, setStatsBackend] = useState<'healthy' | 'unhealthy' | 'unknown'>('unknown');
  const [workspaceTab, setWorkspaceTab] = useState<'analysis' | 'data'>('analysis');

  const [kind, setKind] = useState<AnalysisKind>('describe');
  const [valueCol, setValueCol] = useState('');
  const [groupCol, setGroupCol] = useState('');
  const [xCol, setXCol] = useState('');
  const [yCol, setYCol] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [outputLog, setOutputLog] = useState<AnalysisReport[]>([]);

  const active = useMemo(
    () => sources.find((s) => s.id === activeId) || sources[0] || null,
    [sources, activeId]
  );

  const headers = active?.headers || [];
  const rows = active?.rows || [];
  const numCols = useMemo(() => numericColumns(headers, rows), [headers, rows]);
  const catCols = useMemo(() => categoricalColumns(headers, rows), [headers, rows]);

  const variables: VarMeta[] = useMemo(() => {
    const num = new Set(numCols);
    const cat = new Set(catCols);
    return headers
      .filter((h) => String(h || '').trim())
      .map((name) => ({
        name,
        kind: num.has(name) ? 'numeric' : cat.has(name) ? 'factor' : 'other',
      }));
  }, [headers, numCols, catCols]);

  useEffect(() => {
    let cancelled = false;
    checkAdvancedStatsHealth().then((status) => {
      if (!cancelled) setStatsBackend(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!valueCol || !numCols.includes(valueCol)) setValueCol(numCols[0] || '');
    if (!xCol || !numCols.includes(xCol)) setXCol(numCols[0] || '');
    if (!yCol || !numCols.includes(yCol)) setYCol(numCols[1] || numCols[0] || '');
    if (!groupCol || !catCols.includes(groupCol)) setGroupCol(catCols[0] || '');
  }, [active, numCols, catCols, valueCol, xCol, yCol, groupCol]);

  const loadExperimentSources = useCallback(async () => {
    if (!experimentId) return;
    setLoadingSources(true);
    setError('');
    try {
      const [expRes, listRes] = await Promise.all([
        fetch(`/api/experiments/${encodeURIComponent(experimentId)}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`/api/data-results?experiment_id=${encodeURIComponent(experimentId)}`, {
          headers: getAuthHeaders(),
        }),
      ]);
      if (expRes.ok) {
        const ed = await expRes.json();
        setExperimentTitle(ed.title || ed.name || 'Experiment');
      }
      if (!listRes.ok) throw new Error('Could not load linked results');
      const data = await listRes.json();
      const list: ResultListItem[] = Array.isArray(data?.results) ? data.results : [];
      const matrices = list.flatMap((r) =>
        matrixFromArtifacts(String(r.id), String(r.title || 'Result'), r.metadata)
      );
      let filtered = matrices;
      if (resultIdParam) {
        const prefer = matrices.filter((m) => m.id.startsWith(`${resultIdParam}:`));
        if (prefer.length) filtered = prefer;
      }
      setSources(filtered);
      setActiveId(filtered[0]?.id || '');
      setReport(null);
      setOutputLog([]);
      if (!filtered.length) {
        setError('No sheets in linked results — Import or load Sample.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load experiment data');
      setSources([]);
    } finally {
      setLoadingSources(false);
    }
  }, [experimentId, resultIdParam]);

  useEffect(() => {
    if (experimentId) void loadExperimentSources();
  }, [experimentId, loadExperimentSources]);

  const updateActiveMatrix = (next: { headers: string[]; rows: string[][] }) => {
    if (!active) return;
    setSources((prev) =>
      prev.map((s) => (s.id === active.id ? { ...s, headers: next.headers, rows: next.rows } : s))
    );
    setReport(null);
  };

  const loadSample = () => {
    const sample = sampleAnalysisMatrix();
    const src: DataSource = {
      id: 'sample',
      label: sample.name,
      headers: sample.headers,
      rows: sample.rows,
      origin: 'sample',
    };
    setSources((prev) => [src, ...prev.filter((s) => s.origin !== 'sample')]);
    setActiveId('sample');
    setReport(null);
    setError('');
    setWorkspaceTab('analysis');
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const imported = await importSpreadsheetFile(file);
      const src: DataSource = {
        id: `upload-${Date.now()}`,
        label: file.name,
        headers: imported.headers,
        rows: imported.rows,
        origin: 'upload',
      };
      setSources((prev) => [src, ...prev]);
      setActiveId(src.id);
      setReport(null);
      setError('');
      setWorkspaceTab('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file');
    }
  };

  const assignVariable = (v: VarMeta) => {
    if (kind === 'describe' && v.kind === 'numeric') {
      setValueCol(v.name);
      return;
    }
    if (kind === 'compare') {
      if (v.kind === 'factor') setGroupCol(v.name);
      else if (v.kind === 'numeric') setValueCol(v.name);
      return;
    }
    if (kind === 'relate' && v.kind === 'numeric') {
      if (!xCol || xCol === v.name) setXCol(v.name);
      else if (!yCol || yCol === xCol) setYCol(v.name);
      else setXCol(v.name);
    }
  };

  const isAssigned = (name: string) => {
    if (kind === 'describe') return name === valueCol;
    if (kind === 'compare') return name === valueCol || name === groupCol;
    return name === xCol || name === yCol;
  };

  const run = async () => {
    if (!active) {
      setError('Load a dataset first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let next: AnalysisReport;
      if (kind === 'describe') {
        if (!valueCol) throw new Error('Assign a continuous variable');
        next = await analyzeDescribe(headers, rows, valueCol);
      } else if (kind === 'compare') {
        if (!groupCol || !valueCol) throw new Error('Assign Factor and Dependent');
        next = await analyzeCompare(headers, rows, groupCol, valueCol);
      } else {
        if (!xCol || !yCol || xCol === yCol) throw new Error('Assign two different continuous variables');
        next = await analyzeRelate(headers, rows, xCol, yCol);
      }
      setReport(next);
      setOutputLog((prev) => [next, ...prev].slice(0, 8));
      setWorkspaceTab('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!report) return [] as Record<string, string | number>[];
    if (report.kind === 'describe') {
      const vals = report.values;
      if (!vals.length) return [];
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const bins = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(vals.length))));
      const width = max === min ? 1 : (max - min) / bins;
      return Array.from({ length: bins }, (_, i) => {
        const lo = min + i * width;
        const hi = lo + width;
        const count = vals.filter((v) =>
          i === bins - 1 ? v >= lo && v <= hi : v >= lo && v < hi
        ).length;
        return { label: fmt(lo + width / 2, 3), count };
      });
    }
    if (report.kind === 'compare') {
      return report.groups.map((g) => ({
        label: g.group,
        mean: g.mean,
        sem: g.sem,
      }));
    }
    return report.points.map((p) => ({ x: p.x, y: p.y }));
  }, [report]);

  const fitLine = useMemo(() => {
    if (!report || report.kind !== 'relate' || report.slope == null || report.intercept == null) {
      return [];
    }
    return buildFitLine(report.points, report.slope, report.intercept);
  }, [report]);

  const rowCount = active ? filledRowCount(headers, rows) : 0;
  const analysisMeta = ANALYSES.find((a) => a.id === kind);

  const roleChip = (role: string, value: string, empty: string) => (
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0 w-16 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {role}
      </span>
      <span
        className={`min-w-0 truncate rounded border px-2 py-1 text-[12px] font-medium tabular-nums ${
          value
            ? 'border-slate-300 bg-white text-slate-900'
            : 'border-dashed border-slate-300 bg-slate-50 text-slate-400'
        }`}
      >
        {value || empty}
      </span>
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#f4f5f7] text-slate-900">
      {/* App toolbar */}
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
              <ChartBarIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold tracking-tight leading-tight">Statistics</div>
              <div className="text-[11px] text-slate-500 truncate leading-tight">
                {experimentTitle
                  ? experimentTitle
                  : active?.label || 'Untitled dataset'}
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <select
            className="max-w-[220px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-800"
            value={active?.id || ''}
            onChange={(e) => {
              setActiveId(e.target.value);
              setReport(null);
            }}
            disabled={!sources.length}
          >
            {!sources.length && <option value="">No dataset</option>}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => void onUpload(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Import
          </button>
          <button
            type="button"
            onClick={loadSample}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100"
          >
            Sample
          </button>

          {experimentId && (
            <Link
              to={`/experiments/${encodeURIComponent(experimentId)}`}
              className="hidden md:inline text-[12px] text-slate-500 hover:text-slate-800"
            >
              Experiment →
            </Link>
          )}

          <div className="flex-1" />

          <span className="text-[11px] text-slate-500 tabular-nums hidden sm:inline">
            {rowCount} × {headers.filter(Boolean).length}
            {' · '}
            {statsBackend === 'healthy' ? 'SciPy' : statsBackend === 'unhealthy' ? 'Local' : '…'}
          </span>

          <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setWorkspaceTab('analysis')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                workspaceTab === 'analysis'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Analysis
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab('data')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                workspaceTab === 'data'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Data
            </button>
          </div>

          <button
            type="button"
            disabled={busy || !active || numCols.length === 0}
            onClick={() => void run()}
            className="rounded-md bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-35"
          >
            {busy ? 'Computing…' : 'Compute'}
          </button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-800">
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {workspaceTab === 'data' ? (
        <div className="flex-1 min-h-0 flex flex-col bg-white">
          <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 py-2 bg-slate-50/80">
            <p className="text-[12px] font-medium text-slate-700">
              Data editor
              <span className="ml-2 font-normal text-slate-500">
                Edit cells before computing — changes stay in this session
              </span>
            </p>
            {loadingSources && (
              <span className="text-[11px] text-slate-500">Loading…</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2">
            {active ? (
              <SpreadsheetGrid
                headers={headers}
                rows={rows}
                onChange={updateActiveMatrix}
                minRows={Math.max(12, rows.length + 2)}
                minCols={Math.max(6, headers.length)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[13px] text-slate-500">
                Import a file or load Sample to open the data editor.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(220px,280px)_1fr]">
          {/* Variables */}
          <aside className="min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-slate-200 bg-slate-50/90">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Variables
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Click to assign</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {!variables.length && (
                <p className="px-3 py-4 text-[12px] text-slate-400">
                  {loadingSources ? 'Loading…' : 'No variables — Import or Sample'}
                </p>
              )}
              {variables.map((v) => {
                const assigned = isAssigned(v.name);
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => assignVariable(v)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                      assigned
                        ? 'bg-sky-50 text-sky-950'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center ${
                        v.kind === 'numeric'
                          ? 'bg-emerald-100 text-emerald-800'
                          : v.kind === 'factor'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                      title={v.kind}
                    >
                      {v.kind === 'numeric' ? '#' : v.kind === 'factor' ? 'A' : '·'}
                    </span>
                    <span className="truncate font-medium">{v.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-slate-200 px-3 py-2 text-[10px] text-slate-400 space-y-0.5">
              <div>
                <span className="inline-block w-3 text-center font-bold text-emerald-700">#</span>{' '}
                Continuous
              </div>
              <div>
                <span className="inline-block w-3 text-center font-bold text-amber-800">A</span>{' '}
                Factor
              </div>
            </div>
          </aside>

          {/* Analysis setup */}
          <section className="min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-slate-200 bg-slate-50/90">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Analysis
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-1">
                {ANALYSES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setKind(a.id);
                      setReport(null);
                    }}
                    className={`w-full text-left rounded-md px-2.5 py-2 border transition-colors ${
                      kind === a.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[12px] font-semibold">{a.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        kind === a.id ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {a.test}
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Roles
                </p>
                {kind === 'describe' && roleChip('Y', valueCol, 'Continuous')}
                {kind === 'compare' && (
                  <>
                    {roleChip('Factor', groupCol, 'Group')}
                    {roleChip('Y', valueCol, 'Dependent')}
                  </>
                )}
                {kind === 'relate' && (
                  <>
                    {roleChip('X', xCol, 'Predictor')}
                    {roleChip('Y', yCol, 'Outcome')}
                  </>
                )}
                <p className="text-[10px] text-slate-400 pt-1">
                  Or choose from dropdowns:
                </p>
                {kind === 'describe' && (
                  <select
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                    value={valueCol}
                    onChange={(e) => setValueCol(e.target.value)}
                  >
                    {numCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                {kind === 'compare' && (
                  <div className="space-y-1.5">
                    <select
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                      value={groupCol}
                      onChange={(e) => setGroupCol(e.target.value)}
                    >
                      {catCols.length === 0 && <option value="">—</option>}
                      {catCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                      value={valueCol}
                      onChange={(e) => setValueCol(e.target.value)}
                    >
                      {numCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {kind === 'relate' && (
                  <div className="space-y-1.5">
                    <select
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                      value={xCol}
                      onChange={(e) => setXCol(e.target.value)}
                    >
                      {numCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                      value={yCol}
                      onChange={(e) => setYCol(e.target.value)}
                    >
                      {numCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={busy || !active || numCols.length === 0}
                onClick={() => void run()}
                className="w-full rounded-md bg-slate-900 py-2 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-35"
              >
                {busy ? 'Computing…' : `Run ${analysisMeta?.short || 'analysis'}`}
              </button>
            </div>
          </section>

          {/* Results output */}
          <section className="min-h-0 bg-[#fafafa] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Results
              </h2>
              {report && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                    {ENGINE_LABEL[report.source] || report.source}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReport(null);
                      setOutputLog([]);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!report && (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-6">
                  <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center mb-3 shadow-sm">
                    <ChartBarIcon className="w-5 h-5 text-slate-300" />
                  </div>
                  <p className="text-[13px] font-medium text-slate-800">Output empty</p>
                  <p className="text-[12px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                    Assign variables, choose an analysis, then Compute — plots and tables appear
                    here like a stats notebook.
                  </p>
                </div>
              )}

              {report && (
                <article className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-100 px-4 py-2.5 flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-slate-900">
                        {report.kind === 'describe' && `Descriptives — ${report.column}`}
                        {report.kind === 'compare' && `${report.test}`}
                        {report.kind === 'relate' && `Correlation — ${report.xCol} × ${report.yCol}`}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {active?.label}
                      </p>
                    </div>
                    {(report.kind === 'compare' || report.kind === 'relate') &&
                      report.significant && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                          p &lt; 0.05
                        </span>
                      )}
                  </div>

                  <div className="px-3 pt-3 pb-1 h-[260px]">
                    {report.kind === 'relate' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart margin={{ top: 8, right: 16, bottom: 12, left: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            name={report.xCol}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            label={{
                              value: report.xCol,
                              position: 'insideBottom',
                              offset: -4,
                              fontSize: 10,
                              fill: '#94a3b8',
                            }}
                            domain={['auto', 'auto']}
                          />
                          <YAxis
                            type="number"
                            name={report.yCol}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            width={44}
                            domain={['auto', 'auto']}
                          />
                          <ZAxis range={[50, 50]} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: '#e2e8f0' }}
                          />
                          <Scatter data={chartData} dataKey="y" fill="#0f172a" name="Points" />
                          {fitLine.length > 0 && (
                            <Line
                              data={fitLine}
                              type="linear"
                              dataKey="fit"
                              stroke="#0284c7"
                              strokeWidth={2}
                              dot={false}
                              name="Fit"
                              legendType="none"
                              isAnimationActive={false}
                            />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : report.kind === 'compare' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: '#e2e8f0' }}
                          />
                          <Bar dataKey="mean" fill="#0f172a" radius={[3, 3, 0, 0]} name="Mean">
                            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#64748b" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: '#e2e8f0' }}
                          />
                          <Bar dataKey="count" fill="#0f172a" radius={[3, 3, 0, 0]} name="Count" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="px-4 pb-4 space-y-3">
                    {report.kind === 'describe' && (
                      <table className="w-full text-[12px] border border-slate-200 rounded overflow-hidden">
                        <tbody>
                          {(
                            [
                              ['N', report.n],
                              ['Mean', fmt(report.mean)],
                              ['Median', fmt(report.median)],
                              ['SD', fmt(report.stdDev)],
                              ['Min', fmt(report.min)],
                              ['Max', fmt(report.max)],
                              ['Q1', report.q1 != null ? fmt(report.q1) : '—'],
                              ['Q3', report.q3 != null ? fmt(report.q3) : '—'],
                            ] as [string, string | number][]
                          ).map(([k, v], i) => (
                            <tr
                              key={k}
                              className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
                            >
                              <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100 w-[40%]">
                                {k}
                              </td>
                              <td className="px-3 py-1.5 font-medium tabular-nums text-slate-900 text-right">
                                {v}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {report.kind === 'compare' && (
                      <>
                        <p className="text-[12px] text-slate-700 font-mono">
                          statistic = {fmt(report.statistic)}
                          {'  '}
                          p = {fmtP(report.pValue)}
                        </p>
                        <div className="overflow-x-auto border border-slate-200 rounded">
                          <table className="min-w-full text-[12px]">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-semibold">Group</th>
                                <th className="text-right px-3 py-1.5 font-semibold">N</th>
                                <th className="text-right px-3 py-1.5 font-semibold">Mean</th>
                                <th className="text-right px-3 py-1.5 font-semibold">SD</th>
                                <th className="text-right px-3 py-1.5 font-semibold">SEM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.groups.map((g, i) => (
                                <tr
                                  key={g.group}
                                  className={i % 2 ? 'bg-slate-50/80' : 'bg-white'}
                                >
                                  <td className="px-3 py-1.5 font-medium">{g.group}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{g.n}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {fmt(g.mean)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {fmt(g.sd)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {fmt(g.sem)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {report.kind === 'relate' && (
                      <>
                        <table className="w-full text-[12px] border border-slate-200 rounded overflow-hidden">
                          <tbody>
                            {(
                              [
                                ['N', report.n],
                                ['Pearson r', fmt(report.r)],
                                ['R²', fmt(report.rSquared)],
                                ['p', report.pValue != null ? fmtP(report.pValue) : '—'],
                                ['Slope', report.slope != null ? fmt(report.slope) : '—'],
                                [
                                  'Intercept',
                                  report.intercept != null ? fmt(report.intercept) : '—',
                                ],
                              ] as [string, string | number][]
                            ).map(([k, v], i) => (
                              <tr
                                key={k}
                                className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
                              >
                                <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">
                                  {k}
                                </td>
                                <td className="px-3 py-1.5 font-medium tabular-nums text-right">
                                  {v}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {report.equation && (
                          <p className="text-[11px] font-mono text-slate-600">{report.equation}</p>
                        )}
                      </>
                    )}

                    {report.interpretation && (
                      <p className="text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                        {report.interpretation}
                      </p>
                    )}
                  </div>
                </article>
              )}

              {outputLog.length > 1 && (
                <div className="pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Session history
                  </p>
                  <ul className="space-y-1">
                    {outputLog.slice(1).map((r, i) => (
                      <li key={`${r.kind}-${i}`}>
                        <button
                          type="button"
                          onClick={() => setReport(r)}
                          className="w-full text-left rounded border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 hover:border-slate-300"
                        >
                          {r.kind === 'describe' && `Descriptives · ${r.column}`}
                          {r.kind === 'compare' && `${r.test} · p=${fmtP(r.pValue)}`}
                          {r.kind === 'relate' && `r=${fmt(r.r)} · ${r.xCol}×${r.yCol}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Status bar */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-1 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="font-medium text-slate-600">Ready</span>
        <span className="text-slate-300">|</span>
        <span>
          Engine:{' '}
          {statsBackend === 'healthy'
            ? 'SciPy (/api/advanced-stats)'
            : statsBackend === 'unhealthy'
              ? 'Local researchStats'
              : 'checking…'}
        </span>
        {active && (
          <>
            <span className="text-slate-300">|</span>
            <span className="truncate">{active.label}</span>
          </>
        )}
      </footer>
    </div>
  );
};

export default DataAnalyticsPage;
