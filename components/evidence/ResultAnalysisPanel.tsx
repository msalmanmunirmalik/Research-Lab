import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import {
  AnalysisKind,
  AnalysisReport,
  analyzeCompare,
  analyzeCorrMatrix,
  analyzeDescribe,
  analyzeMultiCompare,
  analyzeRelate,
  combineTwoFactors,
} from '../../utils/analysisEngine';
import { getAuthHeaders } from '../../utils/apiBase';
import { fmt, fmtP } from '../../utils/researchStats';
import {
  DataBriefing,
  GuideAnswers,
  RecommendedTest,
  ResearchGoal,
  buildGuidePlan,
  decisionCard,
  parseUserStatsIntent,
  plainTakeaway,
  profileContextForAI,
  profileDataset,
  runGuideRecommendations,
} from '../../utils/statsGuide';
import { ChartBarIcon } from '../icons';

type Props = {
  headers: string[];
  rows: string[][];
  resultName?: string;
  experimentId?: string | null;
  resultId?: string | null;
  className?: string;
};

type Mode = 'home' | 'ai' | 'manual';
type AiPhase = 'reading' | 'ready' | 'running' | 'done';
type ManualKind = AnalysisKind | 'factorial';
/** Top-level stats family for the “I know what I want” flow */
type StatsFamily = 'descriptive' | 'compare' | 'correlate';

type GuidedResult = { report: AnalysisReport; meta: RecommendedTest };

const STATS_FAMILIES: { id: StatsFamily; label: string; hint: string }[] = [
  { id: 'descriptive', label: 'Descriptive', hint: 'Summarize one numeric column' },
  { id: 'compare', label: 'Compare groups', hint: 'Factor(s) vs outcome(s)' },
  { id: 'correlate', label: 'Correlate', hint: 'Numeric vs numeric' },
];

const DESIGNS_BY_FAMILY: Record<
  StatsFamily,
  { id: ManualKind; label: string; hint: string }[]
> = {
  descriptive: [{ id: 'describe', label: 'One outcome', hint: 'Mean, SD, distribution' }],
  compare: [
    { id: 'compare', label: 'One factor → one outcome', hint: 't-test / ANOVA' },
    { id: 'multi_compare', label: 'One factor → many outcomes', hint: 'Multi-endpoint panel' },
    { id: 'factorial', label: 'Two factors (A×B)', hint: 'Factorial / two-way snapshot' },
  ],
  correlate: [
    { id: 'relate', label: 'One X → one Y', hint: 'Pearson + scatter' },
    { id: 'corr_matrix', label: 'Many ↔ many', hint: 'Correlation heatmap' },
  ],
};

const AI_INTENT_EXAMPLES = [
  'Find the correlation between agr and egfr',
  'Which test fits the relationship between fibrinogen and Age?',
  'Compare Response across Condition',
];

function histData(values: number[]) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const width = max === min ? 1 : (max - min) / bins;
  return Array.from({ length: bins }, (_, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    const count = values.filter((v) =>
      i === bins - 1 ? v >= lo && v <= hi : v >= lo && v < hi
    ).length;
    return { label: fmt(lo + width / 2, 3), count };
  });
}

function fitLine(points: { x: number; y: number }[], slope: number, intercept: number) {
  if (!points.length) return [];
  const xs = points.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return [
    { x: lo, fit: slope * lo + intercept },
    { x: hi, fit: slope * hi + intercept },
  ];
}

const CorrHeatmap: React.FC<{ columns: string[]; cells: { xCol: string; yCol: string; r: number; significant: boolean }[] }> = ({
  columns,
  cells,
}) => {
  const lookup = (x: string, y: string) => {
    if (x === y) return 1;
    return (
      cells.find((c) => (c.xCol === x && c.yCol === y) || (c.xCol === y && c.yCol === x))?.r ?? null
    );
  };
  const color = (r: number | null) => {
    if (r == null || !Number.isFinite(r)) return '#f1f5f9';
    const t = Math.max(-1, Math.min(1, r));
    if (t >= 0) {
      const a = Math.round(t * 180);
      return `rgb(${255 - a}, ${255 - Math.round(a * 0.35)}, ${255 - a})`;
    }
    const a = Math.round(-t * 180);
    return `rgb(${255 - a}, ${255 - a}, ${255 - Math.round(a * 0.2)})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-collapse min-w-full">
        <thead>
          <tr>
            <th className="p-1" />
            {columns.map((c) => (
              <th key={c} className="p-1 font-medium text-slate-500 max-w-[72px] truncate" title={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((row) => (
            <tr key={row}>
              <th className="p-1 text-left font-medium text-slate-500 max-w-[88px] truncate" title={row}>
                {row}
              </th>
              {columns.map((col) => {
                const r = lookup(row, col);
                return (
                  <td
                    key={col}
                    className="p-0.5 text-center tabular-nums border border-white"
                    style={{ background: color(r), minWidth: 44 }}
                    title={r == null ? '' : `r=${r.toFixed(3)}`}
                  >
                    <span className="inline-block px-1 py-2 text-slate-800">
                      {r == null ? '—' : r.toFixed(2)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ResultChart: React.FC<{ report: AnalysisReport; compact?: boolean }> = ({
  report,
  compact = false,
}) => {
  const h = compact ? 'h-[120px]' : 'h-[180px]';
  if (report.kind === 'multi_compare') {
    return (
      <div className="grid sm:grid-cols-2 gap-3 px-1">
        {report.tests.slice(0, 4).map((t) => (
          <div key={t.valueCol} className="rounded-lg border border-slate-100 p-2">
            <p className="text-[11px] font-medium text-slate-600 mb-1 px-1">{t.valueCol}</p>
            <ResultChart report={t} compact />
            <p className="text-[10px] font-mono text-slate-500 px-1">
              p={fmtP(t.pValue)}
              {t.significant ? ' · sig' : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }
  if (report.kind === 'corr_matrix') {
    return (
      <div className="px-2 py-1">
        <CorrHeatmap columns={report.columns} cells={report.cells} />
      </div>
    );
  }
  if (report.kind === 'describe') {
    return (
      <div className={`${h} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histData(report.values)} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={28} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="count" fill="#0f172a" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  if (report.kind === 'compare') {
    const data = report.groups.map((g) => ({ label: g.group, mean: g.mean, sem: g.sem }));
    return (
      <div className={`${h} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={32} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="mean" fill="#0f172a" radius={[3, 3, 0, 0]}>
              <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#64748b" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  const scatter = report.points.map((p) => ({ x: p.x, y: p.y }));
  const line =
    report.slope != null && report.intercept != null
      ? fitLine(report.points, report.slope, report.intercept)
      : [];
  return (
    <div className={`${h} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis type="number" dataKey="x" tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} />
          <YAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} width={36} domain={['auto', 'auto']} />
          <ZAxis range={[44, 44]} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Scatter data={scatter} dataKey="y" fill="#0f172a" />
          {line.length > 0 && (
            <Line data={line} type="linear" dataKey="fit" stroke="#0284c7" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Results Analyze — expert quick tools + AI Analysis (reads data, suggests & runs tests).
 */
const ResultAnalysisPanel: React.FC<Props> = ({
  headers,
  rows,
  resultName,
  experimentId,
  resultId,
  className = '',
}) => {
  const profile = useMemo(() => profileDataset(headers, rows), [headers, rows]);
  const numCols = profile.numeric;
  const catCols = profile.factors;

  const [mode, setMode] = useState<Mode>('home');
  const [aiPhase, setAiPhase] = useState<AiPhase>('reading');
  const [objective, setObjective] = useState<ResearchGoal>('unsure');
  const [objectiveNote, setObjectiveNote] = useState('');
  const [aiNarrative, setAiNarrative] = useState('');
  const [aiExtras, setAiExtras] = useState<{
    priority?: string;
    decisionFrame?: string;
    nextExperiment?: string;
    watchOuts?: string[];
    claim?: string;
    notClaim?: string;
    nextSteps?: string[];
  }>({});
  const [briefing, setBriefing] = useState<DataBriefing | null>(null);
  const [headline, setHeadline] = useState('');
  const [recs, setRecs] = useState<RecommendedTest[]>([]);
  const [results, setResults] = useState<GuidedResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Shared variable assignments (AI + manual) — user can override AI suggestions
  const [statsFamily, setStatsFamily] = useState<StatsFamily | null>(null);
  const [kind, setKind] = useState<ManualKind>('describe');
  const [valueCol, setValueCol] = useState(numCols[0] || '');
  const [groupCol, setGroupCol] = useState(catCols[0] || '');
  const [groupColB, setGroupColB] = useState(catCols[1] || catCols[0] || '');
  const [outcomeCols, setOutcomeCols] = useState<string[]>(() => numCols.slice(0, 4));
  const [matrixCols, setMatrixCols] = useState<string[]>(() => numCols.slice(0, 5));
  const [xCol, setXCol] = useState(numCols[0] || '');
  const [yCol, setYCol] = useState(numCols[1] || numCols[0] || '');
  const [manualReport, setManualReport] = useState<AnalysisReport | null>(null);

  const applyParsedColumns = (partial: Partial<GuideAnswers>) => {
    if (partial.outcomeCol) setValueCol(partial.outcomeCol);
    if (partial.groupCol) setGroupCol(partial.groupCol);
    if (partial.groupColB) setGroupColB(partial.groupColB);
    if (partial.outcomeCols?.length) setOutcomeCols(partial.outcomeCols);
    if (partial.matrixCols?.length) setMatrixCols(partial.matrixCols);
    if (partial.xCol) setXCol(partial.xCol);
    if (partial.yCol) setYCol(partial.yCol);
  };

  const seedColumnsFromProfile = (p = profile) => {
    setValueCol(p.suggestedOutcome || p.numeric[0] || '');
    setGroupCol(p.suggestedFactor || p.factors[0] || '');
    setGroupColB(p.factors.find((f) => f !== (p.suggestedFactor || p.factors[0])) || p.factors[1] || '');
    setOutcomeCols(p.numeric.slice(0, Math.min(6, p.numeric.length)));
    setMatrixCols(p.numeric.slice(0, Math.min(6, p.numeric.length)));
    setXCol(p.suggestedX || p.numeric[0] || '');
    setYCol(p.suggestedY || p.numeric[1] || p.numeric[0] || '');
  };

  const fullAnalysisHref = useMemo(() => {
    const params = new URLSearchParams();
    if (experimentId) params.set('experimentId', experimentId);
    if (resultId) params.set('resultId', resultId);
    const q = params.toString();
    return q ? `/data-analysis?${q}` : '/data-analysis';
  }, [experimentId, resultId]);

  const answers: GuideAnswers = useMemo(
    () => ({
      goal: objective,
      outcomeCol: valueCol || profile.suggestedOutcome,
      outcomeCols,
      groupCol: groupCol || profile.suggestedFactor,
      groupColB: groupColB || undefined,
      xCol: xCol || profile.suggestedX,
      yCol: yCol || profile.suggestedY,
      matrixCols,
    }),
    [objective, valueCol, outcomeCols, groupCol, groupColB, xCol, yCol, matrixCols, profile]
  );

  const toggleInList = (list: string[], name: string, minKeep = 1) => {
    if (list.includes(name)) {
      if (list.length <= minKeep) return list;
      return list.filter((c) => c !== name);
    }
    return [...list, name];
  };

  const applyPlan = (
    plan: ReturnType<typeof buildGuidePlan>,
    opts?: { setObjectiveFromBriefing?: boolean }
  ) => {
    setBriefing(plan.briefing);
    setHeadline(plan.headline);
    if (opts?.setObjectiveFromBriefing) setObjective(plan.briefing.recommendedGoal);
    setRecs(
      plan.recommendations.map((r) => ({
        ...r,
        selected: r.selected && r.confidence !== 'low' && r.id !== 'compare:blocked',
      }))
    );
  };

  const rebuildPlan = (overrides: Partial<GuideAnswers> = {}) => {
    const next: GuideAnswers = { ...answers, ...overrides };
    if (overrides.goal) setObjective(overrides.goal);
    applyPlan(buildGuidePlan(headers, rows, next));
  };

  const startAiAnalysis = async () => {
    const intent = objectiveNote.trim();
    if (!intent) {
      setError('Describe what you want analyzed — e.g. correlation between two columns.');
      return;
    }

    setMode('ai');
    setAiPhase('reading');
    setError('');
    setResults([]);
    setAiNarrative('');
    setAiExtras({});
    setRecs([]);
    setBriefing(null);

    // Local parse first (no tokens) — picks goal + columns from the ask
    const parsed = parseUserStatsIntent(intent, profile);
    seedColumnsFromProfile();
    applyParsedColumns(parsed.answers);
    setObjective(parsed.goal);

    await new Promise((r) => setTimeout(r, 280));

    const seeded: GuideAnswers = {
      goal: parsed.goal,
      outcomeCol:
        parsed.answers.outcomeCol || profile.suggestedOutcome || profile.numeric[0] || '',
      outcomeCols:
        parsed.answers.outcomeCols ||
        profile.numeric.slice(0, Math.min(6, profile.numeric.length)),
      groupCol: parsed.answers.groupCol || profile.suggestedFactor || profile.factors[0] || '',
      groupColB:
        parsed.answers.groupColB ||
        profile.factors.find((f) => f !== (parsed.answers.groupCol || profile.suggestedFactor)) ||
        profile.factors[1] ||
        '',
      xCol: parsed.answers.xCol || profile.suggestedX || profile.numeric[0] || '',
      yCol: parsed.answers.yCol || profile.suggestedY || profile.numeric[1] || profile.numeric[0] || '',
      matrixCols:
        parsed.answers.matrixCols ||
        profile.numeric.slice(0, Math.min(6, profile.numeric.length)),
    };
    applyParsedColumns(seeded);
    const plan = buildGuidePlan(headers, rows, seeded);
    applyPlan(plan);
    setObjective(parsed.goal === 'unsure' ? plan.briefing.recommendedGoal : parsed.goal);
    setAiNarrative(plan.briefing.situation);
    setAiPhase('ready');

    try {
      const res = await fetch('/api/stats-guide/advise', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userIntent: intent,
          profileContext: profileContextForAI(plan.profile, seeded, plan.briefing, intent),
          goal: seeded.goal,
          recommendations: plan.recommendations.slice(0, 4).map((r) => ({
            title: r.title,
            why: r.plainWhy,
            decision: r.decision,
            ifYes: r.ifYes,
            ifNo: r.ifNo,
            technical: r.technical,
            confidence: r.confidence,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'AI advise failed');
        return;
      }
      if (data.structured) {
        const s = data.structured as Record<string, unknown>;
        const read = Array.isArray(s.data_read)
          ? (s.data_read as string[]).map((t) => `• ${t}`).join('\n')
          : '';
        setAiNarrative(
          [typeof s.situation === 'string' ? s.situation : plan.briefing.situation, read]
            .filter(Boolean)
            .join('\n\n')
        );
        setAiExtras({
          priority: typeof s.priority_test === 'string' ? s.priority_test : undefined,
          decisionFrame: typeof s.decision_frame === 'string' ? s.decision_frame : undefined,
          nextExperiment: typeof s.next_experiment === 'string' ? s.next_experiment : undefined,
          watchOuts: Array.isArray(s.watch_outs) ? (s.watch_outs as string[]) : undefined,
        });
        if (typeof s.priority_test === 'string') setHeadline(s.priority_test);

        const sg = typeof s.suggested_goal === 'string' ? s.suggested_goal : '';
        if (
          sg === 'explore' ||
          sg === 'compare' ||
          sg === 'multi_compare' ||
          sg === 'factorial' ||
          sg === 'relate' ||
          sg === 'corr_matrix'
        ) {
          setObjective(sg);
        }
        const cols = s.suggested_columns as Record<string, unknown> | undefined;
        if (cols && typeof cols === 'object') {
          const patch: Partial<GuideAnswers> = {};
          if (typeof cols.factor_x === 'string' && cols.factor_x) patch.groupCol = cols.factor_x;
          if (typeof cols.factor_y === 'string' && cols.factor_y) patch.groupColB = cols.factor_y;
          if (typeof cols.outcome === 'string' && cols.outcome) patch.outcomeCol = cols.outcome;
          if (typeof cols.x === 'string' && cols.x) patch.xCol = cols.x;
          if (typeof cols.y === 'string' && cols.y) patch.yCol = cols.y;
          if (Array.isArray(cols.outcomes)) {
            patch.outcomeCols = (cols.outcomes as unknown[]).filter(
              (c): c is string => typeof c === 'string'
            );
          }
          if (Array.isArray(cols.matrix)) {
            patch.matrixCols = (cols.matrix as unknown[]).filter(
              (c): c is string => typeof c === 'string'
            );
          }
          applyParsedColumns(patch);
          rebuildPlan({
            ...patch,
            goal: (sg as ResearchGoal) || seeded.goal,
          });
        }
      }
    } catch {
      /* rule-based plan already shown */
    }
  };

  const runAiTests = async () => {
    setBusy(true);
    setError('');
    setAiPhase('running');
    try {
      const goal = objective;
      const plan = buildGuidePlan(headers, rows, { ...answers, goal });
      // Keep user toggles where possible
      const merged = plan.recommendations.map((r) => {
        const prev = recs.find((x) => x.id === r.id);
        return prev ? { ...r, selected: prev.selected } : r;
      });
      const selected = merged.filter((r) => r.selected);
      const toRun = selected.length ? selected : merged.filter((r) => r.confidence === 'high');
      const out = await runGuideRecommendations(
        headers,
        rows,
        toRun.map((r) => ({ ...r, selected: true }))
      );
      if (!out.length) throw new Error('No runnable tests for this sheet yet');
      setResults(out);
      setAiPhase('done');

      // Plain-language explanation
      try {
        const summary = out
          .map(({ report, meta }) => `${meta.title}: ${plainTakeaway(report)}`)
          .join('\n');
        const res = await fetch('/api/stats-guide/explain', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            profileContext: profileContextForAI(
              profile,
              { ...answers, goal },
              briefing || undefined,
              objectiveNote || undefined
            ),
            resultsSummary: `${objectiveNote ? `Scientist request: ${objectiveNote}\n` : ''}${summary}`,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.structured) {
          const s = data.structured as Record<string, unknown>;
          setAiNarrative(
            [
              typeof s.headline === 'string' ? s.headline : '',
              typeof s.what_it_means === 'string' ? s.what_it_means : '',
            ]
              .filter(Boolean)
              .join('\n\n')
          );
          setAiExtras({
            claim: typeof s.what_you_can_claim === 'string' ? s.what_you_can_claim : undefined,
            notClaim: typeof s.what_not_to_claim === 'string' ? s.what_not_to_claim : undefined,
            nextSteps: Array.isArray(s.what_to_do_next) ? (s.what_to_do_next as string[]) : undefined,
            watchOuts: Array.isArray(s.caveats) ? (s.caveats as string[]) : undefined,
          });
        } else {
          setAiNarrative(out.map((o) => plainTakeaway(o.report)).join('\n\n'));
          setAiExtras({
            nextSteps: out.map((o) => decisionCard(o.report, o.meta).action),
          });
        }
      } catch {
        setAiNarrative(out.map((o) => plainTakeaway(o.report)).join('\n\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setAiPhase('ready');
    } finally {
      setBusy(false);
    }
  };

  const runManual = async () => {
    setBusy(true);
    setError('');
    setManualReport(null);
    try {
      if (kind === 'describe') {
        if (!valueCol) throw new Error('Pick a numeric column');
        setManualReport(await analyzeDescribe(headers, rows, valueCol));
      } else if (kind === 'compare') {
        if (!groupCol || !valueCol) throw new Error('Pick Factor X and an outcome');
        setManualReport(await analyzeCompare(headers, rows, groupCol, valueCol));
      } else if (kind === 'multi_compare') {
        if (!groupCol || outcomeCols.length < 2) {
          throw new Error('Pick Factor X and at least two outcomes');
        }
        setManualReport(await analyzeMultiCompare(headers, rows, groupCol, outcomeCols));
      } else if (kind === 'factorial') {
        if (!groupCol || !groupColB || groupCol === groupColB || !valueCol) {
          throw new Error('Pick two different factors (X and Y) and one outcome');
        }
        const cellName = `${groupCol}×${groupColB}`;
        const combined = combineTwoFactors(headers, rows, groupCol, groupColB, cellName);
        setManualReport(await analyzeCompare(combined.headers, combined.rows, cellName, valueCol));
      } else if (kind === 'corr_matrix') {
        if (matrixCols.length < 2) throw new Error('Pick at least two numeric columns');
        setManualReport(await analyzeCorrMatrix(headers, rows, matrixCols));
      } else {
        if (!xCol || !yCol || xCol === yCol) throw new Error('Pick two different columns');
        setManualReport(await analyzeRelate(headers, rows, xCol, yCol));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const designGoal: ResearchGoal | ManualKind = mode === 'ai' ? objective : kind;
  const showFactorX =
    catCols.length > 0 &&
    (designGoal === 'compare' ||
      designGoal === 'multi_compare' ||
      designGoal === 'factorial' ||
      designGoal === 'unsure' ||
      designGoal === 'explore');
  const showFactorY =
    catCols.length >= 2 && (designGoal === 'factorial' || designGoal === 'unsure');
  const showSingleOutcome =
    numCols.length > 0 &&
    (designGoal === 'describe' ||
      designGoal === 'compare' ||
      designGoal === 'factorial' ||
      designGoal === 'explore' ||
      designGoal === 'unsure');
  const showManyOutcomes = numCols.length >= 2 && designGoal === 'multi_compare';
  const showXYPair = designGoal === 'relate';
  const showMatrix = designGoal === 'corr_matrix';

  const renderVariableAssignment = (forAi: boolean) => (
    <section className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-slate-800">Assign variables</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {forAi
              ? 'AI suggested defaults — change Factor X / Y and outcomes anytime'
              : 'Choose Factor X, Factor Y, and outcomes for this design'}
          </p>
        </div>
        {forAi && (
          <button
            type="button"
            onClick={() => {
              seedColumnsFromProfile();
              rebuildPlan({
                outcomeCol: profile.suggestedOutcome || profile.numeric[0] || '',
                outcomeCols: profile.numeric.slice(0, Math.min(6, profile.numeric.length)),
                groupCol: profile.suggestedFactor || profile.factors[0] || '',
                groupColB:
                  profile.factors.find(
                    (f) => f !== (profile.suggestedFactor || profile.factors[0])
                  ) ||
                  profile.factors[1] ||
                  '',
                xCol: profile.suggestedX || profile.numeric[0] || '',
                yCol: profile.suggestedY || profile.numeric[1] || profile.numeric[0] || '',
                matrixCols: profile.numeric.slice(0, Math.min(6, profile.numeric.length)),
              });
            }}
            className="text-[11px] font-medium text-teal-800 hover:text-teal-950"
          >
            Reset to AI picks
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {showFactorX && (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Factor X (grouping)</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
              value={groupCol}
              onChange={(e) => {
                const next = e.target.value;
                setGroupCol(next);
                const alt =
                  next === groupColB ? catCols.find((c) => c !== next) || '' : groupColB;
                if (alt !== groupColB) setGroupColB(alt);
                if (forAi) {
                  rebuildPlan({
                    groupCol: next,
                    ...(alt !== groupColB ? { groupColB: alt } : {}),
                  });
                }
              }}
            >
              {catCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        {showFactorY && (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Factor Y (second grouping)</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
              value={groupColB === groupCol ? '' : groupColB}
              onChange={(e) => {
                const next = e.target.value;
                setGroupColB(next);
                if (forAi) rebuildPlan({ groupColB: next });
              }}
            >
              <option value="" disabled>
                Select Factor Y
              </option>
              {catCols
                .filter((c) => c !== groupCol)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </label>
        )}

        {showSingleOutcome && (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Outcome</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
              value={valueCol}
              onChange={(e) => {
                const next = e.target.value;
                setValueCol(next);
                if (forAi) rebuildPlan({ outcomeCol: next });
              }}
            >
              {numCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        {showXYPair && (
          <>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">X (predictor)</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
                value={xCol}
                onChange={(e) => {
                  const next = e.target.value;
                  setXCol(next);
                  if (forAi) rebuildPlan({ xCol: next });
                }}
              >
                {numCols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">Y (response)</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
                value={yCol}
                onChange={(e) => {
                  const next = e.target.value;
                  setYCol(next);
                  if (forAi) rebuildPlan({ yCol: next });
                }}
              >
                {numCols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {showManyOutcomes && (
        <div>
          <p className="text-[11px] font-medium text-slate-600 mb-1.5">Outcomes (select 2+)</p>
          <div className="flex flex-wrap gap-1.5">
            {numCols.map((c) => {
              const on = outcomeCols.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const next = toggleInList(outcomeCols, c, 2);
                    setOutcomeCols(next);
                    if (forAi) rebuildPlan({ outcomeCols: next });
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                    on
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showMatrix && (
        <div>
          <p className="text-[11px] font-medium text-slate-600 mb-1.5">
            Variables in matrix (select 2+)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {numCols.map((c) => {
              const on = matrixCols.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const next = toggleInList(matrixCols, c, 2);
                    setMatrixCols(next);
                    if (forAi) rebuildPlan({ matrixCols: next });
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                    on
                      ? 'border-sky-300 bg-sky-50 text-sky-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {catCols.length === 0 &&
        (designGoal === 'compare' ||
          designGoal === 'multi_compare' ||
          designGoal === 'factorial') && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
            No category columns detected for Factor X/Y. Add a text column (e.g. Condition, Treatment).
          </p>
        )}
    </section>
  );

  if (numCols.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center ${className}`}
      >
        <ChartBarIcon className="w-7 h-7 text-slate-300 mx-auto mb-2" />
        <p className="text-[14px] font-medium text-slate-800">No numbers to analyze yet</p>
        <p className="text-[13px] text-slate-500 mt-1 max-w-md mx-auto">
          Add numeric columns to this sheet, then Analyze can recommend and run tests for you.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Analyze</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {resultName || 'This result'} · {profile.rowCount} rows · {numCols.length} numeric
          </p>
        </div>
        <Link
          to={fullAnalysisHref}
          className="text-[12px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
        >
          Open Statistics →
        </Link>
      </div>

      <div className="p-5 space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        {/* HOME */}
        {mode === 'home' && (
          <>
            {/* AI — intent-first (no auto token burn) */}
            <section className="rounded-2xl border border-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-5 text-white shadow-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-200/90">
                AI Analysis
              </p>
              <p className="mt-1.5 text-[16px] font-semibold leading-snug">
                Tell us what you want analyzed
              </p>
              <p className="mt-1.5 text-[13px] text-slate-300 leading-relaxed max-w-xl">
                Name the columns and the question. AI only runs after you submit — no automatic
                token use.
              </p>
              <textarea
                value={objectiveNote}
                onChange={(e) => setObjectiveNote(e.target.value)}
                rows={3}
                placeholder="e.g. Find the correlation between agr and egfr"
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-[13px] text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-300/40 resize-y min-h-[72px]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AI_INTENT_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setObjectiveNote(ex)}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!objectiveNote.trim() || busy}
                onClick={() => void startAiAnalysis()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChartBarIcon className="w-4 h-4" />
                Analyze with AI
              </button>
            </section>

            {/* Manual — family → design → variables */}
            <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-slate-900">I know what I want</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Pick the stats type, then how factors and outcomes are arranged
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  1. Type of analysis
                </p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {STATS_FAMILIES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setStatsFamily(f.id);
                        setManualReport(null);
                        if (f.id === 'descriptive') {
                          setKind('describe');
                          setMode('manual');
                        }
                      }}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        statsFamily === f.id
                          ? 'border-slate-900 bg-white shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className="text-[13px] font-semibold text-slate-900">{f.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{f.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              {statsFamily && statsFamily !== 'descriptive' && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    2. Variable design
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {DESIGNS_BY_FAMILY[statsFamily].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setKind(d.id);
                          setMode('manual');
                          setManualReport(null);
                          if (!groupCol && catCols[0]) setGroupCol(catCols[0]);
                          if (!groupColB && catCols[1]) setGroupColB(catCols[1]);
                          if (!outcomeCols.length) setOutcomeCols(numCols.slice(0, 4));
                          if (!matrixCols.length) setMatrixCols(numCols.slice(0, 5));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-slate-400 transition-colors"
                      >
                        <p className="text-[13px] font-semibold text-slate-900">{d.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{d.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* AI ANALYSIS */}
        {mode === 'ai' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('home');
                  setAiPhase('reading');
                  setResults([]);
                }}
                className="text-[12px] font-medium text-slate-500 hover:text-slate-800"
              >
                ← Back
              </button>
              {aiPhase !== 'reading' && (
                <span className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                  AI Analysis
                </span>
              )}
            </div>

            {aiPhase === 'reading' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-10 text-center">
                <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-800 animate-spin" />
                <p className="text-[14px] font-medium text-slate-800">Reading your data…</p>
                <p className="text-[12px] text-slate-500 mt-1">
                  Mapping columns, group sizes, and which decisions this sheet can support
                </p>
              </div>
            )}

            {aiPhase !== 'reading' && (
              <>
                {/* Decision briefing */}
                <section className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-900 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-200/90">
                      Decision briefing
                    </p>
                    <p className="mt-1 text-[14px] font-semibold leading-snug">
                      {headline || briefing?.situation || profile.summary}
                    </p>
                  </div>
                  <div className="p-4 space-y-4">
                    {aiNarrative && (
                      <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {aiNarrative}
                      </p>
                    )}

                    {briefing && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {briefing.insights.map((ins) => (
                          <div
                            key={ins.id}
                            className={`rounded-lg border px-3 py-2.5 ${
                              ins.tone === 'opportunity'
                                ? 'border-emerald-100 bg-emerald-50/50'
                                : ins.tone === 'caution'
                                  ? 'border-amber-100 bg-amber-50/50'
                                  : 'border-slate-100 bg-slate-50'
                            }`}
                          >
                            <p className="text-[12px] font-semibold text-slate-900">{ins.title}</p>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{ins.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {briefing && briefing.decisionsYouCanMake.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                          Decisions this sheet can support
                        </p>
                        <ul className="space-y-1">
                          {briefing.decisionsYouCanMake.map((d) => (
                            <li key={d} className="text-[12px] text-slate-700 flex gap-2">
                              <span className="text-teal-700 font-bold">?</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(profile.factors.length >= 2 || profile.numeric.length >= 2) && (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-800">Design vocabulary: </span>
                        {profile.factors.length >= 2
                          ? 'Two grouping columns = factorial / two-way design (A×B). '
                          : ''}
                        {profile.numeric.length >= 2 && profile.factors.length >= 1
                          ? 'One group × many readouts = multi-endpoint comparison. '
                          : ''}
                        {profile.numeric.length >= 3
                          ? 'Many continuous columns vs each other = correlation matrix.'
                          : ''}
                      </div>
                    )}

                    {(aiExtras.priority || aiExtras.decisionFrame) && (
                      <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2.5 text-[12px] text-slate-700 space-y-1">
                        {aiExtras.priority && (
                          <p>
                            <span className="font-semibold text-sky-900">Run first: </span>
                            {aiExtras.priority}
                          </p>
                        )}
                        {aiExtras.decisionFrame && (
                          <p>
                            <span className="font-semibold text-sky-900">How to read the result: </span>
                            {aiExtras.decisionFrame}
                          </p>
                        )}
                      </div>
                    )}

                    {((briefing?.gaps.length ?? 0) > 0 || (aiExtras.watchOuts?.length ?? 0) > 0) && (
                      <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900 mb-1">
                          Before you decide
                        </p>
                        <ul className="space-y-1">
                          {[...(briefing?.gaps || []), ...(aiExtras.watchOuts || [])]
                            .slice(0, 4)
                            .map((g) => (
                              <li key={g} className="text-[12px] text-amber-950/90">
                                · {g}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {profile.columns
                        .filter((c) => c.kind !== 'other')
                        .slice(0, 8)
                        .map((c) => (
                          <span
                            key={c.name}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                              c.kind === 'numeric'
                                ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                                : 'border-amber-100 bg-amber-50 text-amber-950'
                            }`}
                          >
                            <span className="opacity-60">{c.kind === 'numeric' ? '#' : 'A'}</span>
                            {c.name}
                          </span>
                        ))}
                    </div>
                  </div>
                </section>

                {aiPhase !== 'done' && (
                  <section className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Your request
                      </p>
                      <p className="mt-1 text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {objectiveNote}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('home');
                          setAiPhase('reading');
                          setResults([]);
                        }}
                        className="mt-2 text-[11px] font-medium text-teal-800 hover:underline"
                      >
                        Edit request
                      </button>
                    </div>
                    {renderVariableAssignment(true)}
                  </section>
                )}

                {aiPhase !== 'done' && (
                  <section className="space-y-2">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Tests that answer those decisions
                    </h4>
                    {recs.map((r, idx) => (
                      <label
                        key={r.id}
                        className={`flex gap-3 rounded-xl border px-3.5 py-3 cursor-pointer ${
                          r.selected ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={r.selected}
                          disabled={r.id === 'compare:blocked'}
                          onChange={() =>
                            setRecs((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, selected: !x.selected } : x
                              )
                            )
                          }
                        />
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {idx === 0 && r.selected && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-800 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                Priority
                              </span>
                            )}
                            <p className="text-[13px] font-semibold text-slate-900">{r.title}</p>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                              {r.confidence}
                            </span>
                          </div>
                          <p className="text-[12px] text-slate-800">
                            <span className="font-medium text-slate-500">Helps you decide: </span>
                            {r.decision}
                          </p>
                          <p className="text-[12px] text-slate-600 leading-relaxed">{r.plainWhy}</p>
                          <div className="grid sm:grid-cols-2 gap-1.5 text-[11px]">
                            <p className="rounded-md bg-emerald-50/80 border border-emerald-100 px-2 py-1.5 text-emerald-950">
                              <span className="font-semibold">If effect: </span>
                              {r.ifYes}
                            </p>
                            <p className="rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5 text-slate-700">
                              <span className="font-semibold">If not: </span>
                              {r.ifNo}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={busy || !recs.some((r) => r.selected)}
                      onClick={() => void runAiTests()}
                      className="mt-2 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      <ChartBarIcon className="w-4 h-4" />
                      {busy || aiPhase === 'running' ? 'Running…' : 'Run & get a decision'}
                    </button>
                  </section>
                )}

                {aiPhase === 'done' && (
                  <section className="space-y-4">
                    <div className="rounded-xl border border-teal-100 bg-teal-50/40 px-4 py-3 text-[13px] text-slate-800 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                        Decision summary
                      </p>
                      {aiNarrative && (
                        <p className="whitespace-pre-wrap leading-relaxed">{aiNarrative}</p>
                      )}
                      {aiExtras.claim && (
                        <p>
                          <span className="font-semibold text-slate-900">You can say: </span>
                          {aiExtras.claim}
                        </p>
                      )}
                      {aiExtras.notClaim && (
                        <p>
                          <span className="font-semibold text-slate-900">Don’t claim: </span>
                          {aiExtras.notClaim}
                        </p>
                      )}
                      {(aiExtras.nextSteps?.length || aiExtras.nextExperiment) && (
                        <div>
                          <p className="font-semibold text-slate-900 mb-0.5">Next:</p>
                          <ul className="space-y-0.5">
                            {aiExtras.nextExperiment && (
                              <li>· {aiExtras.nextExperiment}</li>
                            )}
                            {(aiExtras.nextSteps || []).map((s) => (
                              <li key={s}>· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {results.map(({ report, meta }) => {
                      const card = decisionCard(report, meta);
                      return (
                        <article
                          key={meta.id}
                          className="rounded-xl border border-slate-200 overflow-hidden"
                        >
                          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-[13px] font-semibold text-slate-900">{meta.title}</h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">{meta.decision}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">
                              {report.source === 'scipy' ? 'SciPy' : 'Local'}
                            </span>
                          </div>
                          <div className="px-3 pt-2">
                            <ResultChart report={report} />
                          </div>
                          <div className="px-4 pb-4 space-y-2">
                            <p className="text-[13px] text-slate-700 leading-relaxed">{card.verdict}</p>
                            <p className="text-[12px] rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-slate-800">
                              <span className="font-semibold">Recommended action: </span>
                              {card.action}
                            </p>
                            {report.kind === 'compare' && (
                              <p className="text-[11px] font-mono text-slate-500">
                                {report.test} · p = {fmtP(report.pValue)}
                              </p>
                            )}
                            {report.kind === 'relate' && (
                              <p className="text-[11px] font-mono text-slate-500">
                                r = {fmt(report.r)}
                                {report.pValue != null ? ` · p = ${fmtP(report.pValue)}` : ''}
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setAiPhase('ready');
                        setResults([]);
                      }}
                      className="text-[12px] font-medium text-slate-600 hover:text-slate-900"
                    >
                      Adjust & re-run
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* MANUAL */}
        {mode === 'manual' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setMode('home')}
              className="text-[12px] font-medium text-slate-500 hover:text-slate-800"
            >
              ← Back
            </button>
            <div>
              <p className="text-[12px] font-medium text-slate-600 mb-2">Design</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'describe' as const, label: 'Describe' },
                    { id: 'compare' as const, label: 'One factor → one outcome' },
                    { id: 'multi_compare' as const, label: 'One factor → many outcomes' },
                    { id: 'factorial' as const, label: 'Two factors (A×B)' },
                    { id: 'relate' as const, label: 'One X → one Y' },
                    { id: 'corr_matrix' as const, label: 'Many ↔ many' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setKind(t.id);
                      setManualReport(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                      kind === t.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {renderVariableAssignment(false)}
            <button
              type="button"
              disabled={busy}
              onClick={() => void runManual()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? 'Running…' : 'Run'}
            </button>
            {manualReport && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 pt-2">
                  <ResultChart report={manualReport} />
                </div>
                <p className="px-4 pb-4 text-[13px] text-slate-700">{plainTakeaway(manualReport)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultAnalysisPanel;
