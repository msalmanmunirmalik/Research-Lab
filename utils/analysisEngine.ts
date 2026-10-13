/**
 * Shared analysis engine for Analysis page + Results → Analyze.
 * SciPy (/api/advanced-stats) first, then researchStats local fallback.
 */

import {
  checkAdvancedStatsHealth,
  runAdvancedAnova,
  runAdvancedCorrelationXY,
  runAdvancedDescriptiveValues,
  runAdvancedRegressionXY,
  runAdvancedTTest,
} from './advancedStatsClient';
import {
  describe,
  describeGroups,
  extractGroupedValues,
  extractXY,
  fmt,
  fmtP,
  linearRegression,
  oneWayAnova,
  parseNumeric,
  pearson,
  welchTTest,
  type GroupSummary,
} from './researchStats';

export type StatsSource = 'scipy' | 'local';

export type AnalysisKind =
  | 'describe'
  | 'compare'
  | 'relate'
  /** One grouping factor × several numeric outcomes (multi-endpoint) */
  | 'multi_compare'
  /** Pairwise associations among several numeric columns */
  | 'corr_matrix';

export type DescribeReport = {
  kind: 'describe';
  source: StatsSource;
  column: string;
  n: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1?: number;
  q3?: number;
  interpretation?: string;
  values: number[];
};

export type CompareReport = {
  kind: 'compare';
  source: StatsSource;
  test: string;
  groupCol: string;
  valueCol: string;
  groups: GroupSummary[];
  statistic: number;
  pValue: number;
  significant: boolean;
  interpretation: string;
};

export type RelateReport = {
  kind: 'relate';
  source: StatsSource;
  xCol: string;
  yCol: string;
  n: number;
  r: number;
  rSquared: number;
  pValue?: number;
  slope?: number;
  intercept?: number;
  equation?: string;
  significant?: boolean;
  interpretation: string;
  points: { x: number; y: number }[];
};

export type MultiCompareReport = {
  kind: 'multi_compare';
  source: StatsSource;
  groupCol: string;
  outcomes: string[];
  /** Per-outcome comparison (same grouping factor) */
  tests: CompareReport[];
  significantOutcomes: string[];
  interpretation: string;
};

export type CorrMatrixCell = {
  xCol: string;
  yCol: string;
  n: number;
  r: number;
  pValue: number;
  significant: boolean;
};

export type CorrMatrixReport = {
  kind: 'corr_matrix';
  source: StatsSource;
  columns: string[];
  cells: CorrMatrixCell[];
  strongest: CorrMatrixCell | null;
  interpretation: string;
};

export type AnalysisReport =
  | DescribeReport
  | CompareReport
  | RelateReport
  | MultiCompareReport
  | CorrMatrixReport;

export { checkAdvancedStatsHealth };

export function numericColumns(headers: string[], rows: string[][]): string[] {
  return headers.filter((_, ci) => rows.some((r) => parseNumeric(r[ci]) != null));
}

export function categoricalColumns(headers: string[], rows: string[][]): string[] {
  return headers.filter((_, ci) => {
    const vals = rows.map((r) => String(r[ci] ?? '').trim()).filter(Boolean);
    if (vals.length < 2) return false;
    const numericShare = vals.filter((v) => parseNumeric(v) != null).length / vals.length;
    if (numericShare > 0.85) return false;
    const unique = new Set(vals);
    return unique.size >= 2 && unique.size <= Math.min(20, Math.ceil(vals.length * 0.6));
  });
}

export function columnValues(headers: string[], rows: string[][], col: string): number[] {
  const i = headers.indexOf(col);
  if (i < 0) return [];
  return rows.map((r) => parseNumeric(r[i])).filter((n): n is number => n != null);
}

function strengthWords(r: number): string {
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'positive' : 'negative';
  if (abs >= 0.7) return `strong ${dir}`;
  if (abs >= 0.5) return `moderate ${dir}`;
  if (abs >= 0.3) return `weak ${dir}`;
  return `very weak ${dir}`;
}

/** Descriptive stats for one numeric column. */
export async function analyzeDescribe(
  headers: string[],
  rows: string[][],
  column: string
): Promise<DescribeReport> {
  const data = columnValues(headers, rows, column);
  if (data.length < 2) {
    throw new Error('Need at least 2 numeric values in the selected column');
  }

  const remote = await runAdvancedDescriptiveValues(data);
  if (remote) {
    return {
      kind: 'describe',
      source: 'scipy',
      column,
      n: remote.count,
      mean: remote.mean,
      median: remote.median,
      stdDev: remote.standardDeviation,
      min: remote.min,
      max: remote.max,
      q1: remote.quartiles?.q1,
      q3: remote.quartiles?.q3,
      interpretation: `n=${remote.count}, mean ${fmt(remote.mean)} ± ${fmt(remote.standardDeviation)} (SD).`,
      values: data,
    };
  }

  const local = describe(data);
  return {
    kind: 'describe',
    source: 'local',
    column,
    n: local.n,
    mean: local.mean,
    median: local.median,
    stdDev: local.sd,
    min: local.min,
    max: local.max,
    q1: local.q1,
    q3: local.q3,
    interpretation: `n=${local.n}, mean ${fmt(local.mean)} ± ${fmt(local.sd)} (SD).`,
    values: data,
  };
}

/** Compare groups: Welch t-test (2) or one-way ANOVA (3+). */
export async function analyzeCompare(
  headers: string[],
  rows: string[][],
  groupCol: string,
  valueCol: string
): Promise<CompareReport> {
  const grouped = extractGroupedValues(headers, rows, groupCol, valueCol);
  const groups = describeGroups(grouped);
  if (groups.length < 2) {
    throw new Error('Need at least 2 groups with numeric values');
  }
  const arrays = groups.map((g) => grouped.get(g.group) || []);

  if (groups.length === 2) {
    const [a, b] = arrays;
    const remote = await runAdvancedTTest(a, b);
    if (remote && Number.isFinite(remote.pValue)) {
      const significant = remote.pValue < 0.05;
      return {
        kind: 'compare',
        source: 'scipy',
        test: remote.testType || 'Two-sample t-test',
        groupCol,
        valueCol,
        groups,
        statistic: remote.tStatistic,
        pValue: remote.pValue,
        significant,
        interpretation: significant
          ? `Group means differ (p=${fmtP(remote.pValue)}).`
          : `No significant difference (p=${fmtP(remote.pValue)}).`,
      };
    }
    const local = welchTTest(a, b, groups[0].group, groups[1].group);
    return {
      kind: 'compare',
      source: 'local',
      test: 'Welch t-test',
      groupCol,
      valueCol,
      groups,
      statistic: local.t,
      pValue: local.pValue,
      significant: local.significant,
      interpretation: local.significant
        ? `Means differ (Δ=${fmt(local.meanDiff)}, p=${fmtP(local.pValue)}).`
        : `No significant difference (p=${fmtP(local.pValue)}).`,
    };
  }

  const remoteAnova = await runAdvancedAnova(
    rows.map((row) => {
      const obj: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const n = parseNumeric(row[i]);
        obj[h] = n != null ? n : String(row[i] ?? '');
      });
      return obj;
    }),
    groupCol,
    valueCol
  );
  if (remoteAnova) {
    return {
      kind: 'compare',
      source: 'scipy',
      test: 'One-way ANOVA',
      groupCol,
      valueCol,
      groups,
      statistic: remoteAnova.statistic,
      pValue: remoteAnova.pValue,
      significant: remoteAnova.significant,
      interpretation: remoteAnova.significant
        ? `At least one group mean differs (F=${fmt(remoteAnova.statistic)}, p=${fmtP(remoteAnova.pValue)}).`
        : `No significant group effect (p=${fmtP(remoteAnova.pValue)}).`,
    };
  }

  const local = oneWayAnova(grouped);
  return {
    kind: 'compare',
    source: 'local',
    test: 'One-way ANOVA',
    groupCol,
    valueCol,
    groups,
    statistic: local.F,
    pValue: local.pValue,
    significant: local.significant,
    interpretation: local.significant
      ? `At least one group mean differs (F=${fmt(local.F)}, p=${fmtP(local.pValue)}).`
      : `No significant group effect (p=${fmtP(local.pValue)}).`,
  };
}

/** Correlation + linear fit between two numeric columns. */
export async function analyzeRelate(
  headers: string[],
  rows: string[][],
  xCol: string,
  yCol: string
): Promise<RelateReport> {
  const points = extractXY(headers, rows, xCol, yCol);
  if (points.length < 3) {
    throw new Error('Need at least 3 paired numeric rows');
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const regLocal = linearRegression(points);

  const [corrRemote, regRemote] = await Promise.all([
    runAdvancedCorrelationXY(xs, ys),
    runAdvancedRegressionXY(xs, ys),
  ]);

  if (corrRemote && Number.isFinite(corrRemote.correlation)) {
    const r = corrRemote.correlation;
    const slope = regRemote?.slope ?? regLocal.slope;
    const intercept = regRemote?.intercept ?? regLocal.intercept;
    const rSquared = regRemote?.rSquared ?? r * r;
    const equation =
      regRemote?.equation || `y = ${fmt(slope)}·x ${intercept >= 0 ? '+' : '−'} ${fmt(Math.abs(intercept))}`;
    return {
      kind: 'relate',
      source: 'scipy',
      xCol,
      yCol,
      n: points.length,
      r,
      rSquared,
      slope,
      intercept,
      equation,
      interpretation: `${strengthWords(r)} correlation (r=${fmt(r)}). ${equation}`,
      points,
    };
  }

  const local = pearson(points);
  return {
    kind: 'relate',
    source: 'local',
    xCol,
    yCol,
    n: local.n,
    r: local.r,
    rSquared: local.rSquared,
    pValue: local.pValue,
    significant: local.significant,
    slope: regLocal.slope,
    intercept: regLocal.intercept,
    equation: regLocal.equation,
    interpretation: `${strengthWords(local.r)} correlation (r=${fmt(local.r)}, p=${fmtP(local.pValue)}). ${regLocal.equation}`,
    points,
  };
}

/**
 * Multi-endpoint comparison: one grouping factor across several numeric outcomes.
 * (Pragmatic alternative to full MANOVA — runs a valid univariate test per outcome.)
 */
export async function analyzeMultiCompare(
  headers: string[],
  rows: string[][],
  groupCol: string,
  outcomes: string[]
): Promise<MultiCompareReport> {
  const cols = outcomes.filter((c) => c && c !== groupCol);
  if (!groupCol || cols.length < 2) {
    throw new Error('Need one group column and at least 2 numeric outcomes');
  }
  const tests: CompareReport[] = [];
  for (const valueCol of cols.slice(0, 8)) {
    try {
      tests.push(await analyzeCompare(headers, rows, groupCol, valueCol));
    } catch {
      /* skip outcomes that cannot be tested */
    }
  }
  if (!tests.length) throw new Error('Could not compare any outcomes for this group column');
  const significantOutcomes = tests.filter((t) => t.significant).map((t) => t.valueCol);
  const source = tests.some((t) => t.source === 'scipy') ? 'scipy' : 'local';
  return {
    kind: 'multi_compare',
    source,
    groupCol,
    outcomes: tests.map((t) => t.valueCol),
    tests,
    significantOutcomes,
    interpretation:
      significantOutcomes.length > 0
        ? `Across ${tests.length} outcomes, ${significantOutcomes.length} show a group difference on “${groupCol}”: ${significantOutcomes.join(', ')}.`
        : `Across ${tests.length} outcomes, no clear group difference on “${groupCol}” with this sample.`,
  };
}

/**
 * Correlation matrix among numeric columns (all pairwise, or X-set × Y-set).
 * Caps at 8 columns to keep the UI readable.
 */
export async function analyzeCorrMatrix(
  headers: string[],
  rows: string[][],
  columns: string[],
  yColumns?: string[]
): Promise<CorrMatrixReport> {
  const xs = columns.filter(Boolean).slice(0, 8);
  const ys = (yColumns && yColumns.length ? yColumns : xs).filter(Boolean).slice(0, 8);
  if (xs.length < 2 && ys.length < 2) {
    throw new Error('Need at least 2 numeric columns for a correlation matrix');
  }
  const cells: CorrMatrixCell[] = [];
  for (const xCol of xs) {
    for (const yCol of ys) {
      if (xCol === yCol) continue;
      // Avoid duplicate pairs when square matrix (keep x < y by name)
      if (!yColumns && xCol >= yCol) continue;
      try {
        const rel = await analyzeRelate(headers, rows, xCol, yCol);
        cells.push({
          xCol,
          yCol,
          n: rel.n,
          r: rel.r,
          pValue: rel.pValue ?? 1,
          significant: Boolean(rel.significant || (rel.pValue != null && rel.pValue < 0.05)),
        });
      } catch {
        /* skip pair */
      }
    }
  }
  if (!cells.length) throw new Error('Could not compute any correlations');
  const strongest = [...cells].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0] || null;
  const labelCols = Array.from(new Set([...xs, ...ys]));
  return {
    kind: 'corr_matrix',
    source: 'local',
    columns: labelCols,
    cells,
    strongest,
    interpretation: strongest
      ? `Strongest association: ${strongest.xCol} ↔ ${strongest.yCol} (r=${fmt(strongest.r)}, p=${fmtP(strongest.pValue)}). ${cells.filter((c) => c.significant).length} of ${cells.length} pairs look significant.`
      : `Computed ${cells.length} pairwise correlations.`,
  };
}

/**
 * Build an in-memory sheet where two factors are combined (A×B cells).
 * Useful exploratory stand-in before a full two-way ANOVA.
 */
export function combineTwoFactors(
  headers: string[],
  rows: string[][],
  factorA: string,
  factorB: string,
  combinedName = 'A×B'
): { headers: string[]; rows: string[][] } {
  const ai = headers.indexOf(factorA);
  const bi = headers.indexOf(factorB);
  if (ai < 0 || bi < 0) return { headers, rows };
  const nextHeaders = [...headers, combinedName];
  const nextRows = rows.map((r) => {
    const a = String(r[ai] ?? '').trim();
    const b = String(r[bi] ?? '').trim();
    const cell = a && b ? `${a} × ${b}` : '';
    return [...r, cell];
  });
  return { headers: nextHeaders, rows: nextRows };
}

/** Realistic sample matrix for demos. */
export function sampleAnalysisMatrix(): { headers: string[]; rows: string[][]; name: string } {
  return {
    name: 'Sample: factorial dose–response',
    headers: ['Condition', 'Batch', 'Dose', 'Response', 'Viability'],
    rows: [
      ['Control', 'A', '0', '12.1', '98'],
      ['Control', 'A', '0', '11.4', '97'],
      ['Control', 'B', '0', '13.0', '96'],
      ['Control', 'B', '0', '12.6', '95'],
      ['Low', 'A', '5', '15.2', '92'],
      ['Low', 'A', '5', '14.8', '91'],
      ['Low', 'B', '5', '16.1', '90'],
      ['Low', 'B', '5', '15.5', '89'],
      ['High', 'A', '20', '21.3', '78'],
      ['High', 'A', '20', '22.0', '76'],
      ['High', 'B', '20', '20.7', '80'],
      ['High', 'B', '20', '21.8', '77'],
      ['High', 'A', '20', '19.9', '79'],
      ['High', 'B', '20', '22.4', '75'],
    ],
  };
}
