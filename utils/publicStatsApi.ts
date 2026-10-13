/**
 * Free public statistics APIs + local fallback (researchStats).
 * Used from Results → Analyze so scientists get quick tests without leaving the pack.
 *
 * Providers (no API key):
 * - Kiprio: describe, correlation, outliers
 * - DataTistics: descriptive, t-test, ANOVA, correlation
 * - Local: utils/researchStats (always available offline)
 */

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

export type StatsSource = 'kiprio' | 'datatistics' | 'local';

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
  outliers?: number[];
  interpretation?: string;
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
};

export type AnalysisReport = DescribeReport | CompareReport | RelateReport;

const KIPRIO = 'https://kiprio.com/v1/statistics';
const DATATISTICS = 'https://datatistics.app/api/calculators';

async function postJson(
  url: string,
  body: unknown,
  timeoutMs = 9000
): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export function numericColumns(headers: string[], rows: string[][]): string[] {
  return headers.filter((_, ci) =>
    rows.some((r) => parseNumeric(r[ci]) != null)
  );
}

export function categoricalColumns(headers: string[], rows: string[][]): string[] {
  return headers.filter((h, ci) => {
    const vals = rows.map((r) => String(r[ci] ?? '').trim()).filter(Boolean);
    if (vals.length < 2) return false;
    const numericShare =
      vals.filter((v) => parseNumeric(v) != null).length / vals.length;
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

  const [kiprio, outliers, dt] = await Promise.all([
    postJson(`${KIPRIO}/describe`, { data }),
    postJson(`${KIPRIO}/outliers`, { data }),
    postJson(`${DATATISTICS}/standard-deviation`, { values: data }),
  ]);

  if (kiprio && typeof kiprio.mean === 'number') {
    return {
      kind: 'describe',
      source: 'kiprio',
      column,
      n: Number(kiprio.count ?? data.length),
      mean: Number(kiprio.mean),
      median: Number(kiprio.median ?? kiprio.mean),
      stdDev: Number(kiprio.std_dev ?? 0),
      min: Number(kiprio.min ?? Math.min(...data)),
      max: Number(kiprio.max ?? Math.max(...data)),
      q1: typeof kiprio.q1 === 'number' ? kiprio.q1 : undefined,
      q3: typeof kiprio.q3 === 'number' ? kiprio.q3 : undefined,
      outliers: Array.isArray(outliers?.outliers)
        ? (outliers.outliers as number[])
        : undefined,
      interpretation: outliers?.outlier_count
        ? `${outliers.outlier_count} possible outlier(s) by IQR rule.`
        : undefined,
    };
  }

  if (dt?.stat && typeof dt.stat === 'object') {
    const s = dt.stat as Record<string, unknown>;
    const local = describe(data);
    return {
      kind: 'describe',
      source: 'datatistics',
      column,
      n: Number(s['Sample size (n)'] ?? local.n),
      mean: Number(s.Mean ?? local.mean),
      median: Number(s.Median ?? local.median),
      stdDev: Number(s['Sample SD'] ?? local.sd),
      min: local.min,
      max: local.max,
      q1: local.q1,
      q3: local.q3,
      interpretation: typeof dt.interpretation === 'string' ? dt.interpretation : undefined,
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
    interpretation: 'Computed locally (public APIs unavailable).',
  };
}

/** Compare groups: t-test (2 groups) or ANOVA (3+). */
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
    const remote = await postJson(`${DATATISTICS}/ttest-two`, {
      sample1: a,
      sample2: b,
    });
    if (remote && typeof remote.p_value === 'number') {
      return {
        kind: 'compare',
        source: 'datatistics',
        test: String(remote.test || 'Independent t-test'),
        groupCol,
        valueCol,
        groups,
        statistic: Number(remote.t_statistic ?? 0),
        pValue: Number(remote.p_value),
        significant: Boolean(remote.significant),
        interpretation: String(
          remote.interpretation ||
            (remote.significant
              ? 'Group means differ significantly (p < 0.05).'
              : 'No significant difference between group means.')
        ),
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
        : `No significant difference (p=${fmtP(local.pValue)}). Local fallback.`,
    };
  }

  const remote = await postJson(`${DATATISTICS}/anova`, { groups: arrays });
  if (remote && typeof remote.p_value === 'number') {
    return {
      kind: 'compare',
      source: 'datatistics',
      test: String(remote.test || 'One-way ANOVA'),
      groupCol,
      valueCol,
      groups,
      statistic: Number(remote.f_statistic ?? 0),
      pValue: Number(remote.p_value),
      significant: Boolean(remote.significant),
      interpretation: String(remote.interpretation || ''),
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
      : `No significant group effect (p=${fmtP(local.pValue)}). Local fallback.`,
  };
}

/** Correlation (+ optional regression) between two numeric columns. */
export async function analyzeRelate(
  headers: string[],
  rows: string[][],
  xCol: string,
  yCol: string
): Promise<RelateReport> {
  const points = extractXY(headers, rows, xCol, yCol);
  if (points.length < 3) {
    throw new Error('Need at least 3 paired numeric rows for correlation');
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const [kiprio, dt] = await Promise.all([
    postJson(`${KIPRIO}/correlation`, { x: xs, y: ys }),
    postJson(`${DATATISTICS}/correlation`, { x: xs, y: ys }),
  ]);

  const reg = linearRegression(points);

  if (kiprio && typeof kiprio.pearson_r === 'number') {
    const r = Number(kiprio.pearson_r);
    return {
      kind: 'relate',
      source: 'kiprio',
      xCol,
      yCol,
      n: Number(kiprio.n ?? points.length),
      r,
      rSquared: Number(kiprio.r_squared ?? r * r),
      slope: reg.slope,
      intercept: reg.intercept,
      equation: reg.equation,
      interpretation: `${String(kiprio.interpretation || strengthWords(r) + ' correlation')}. ${reg.equation}`,
    };
  }

  if (dt && typeof dt.r === 'number') {
    return {
      kind: 'relate',
      source: 'datatistics',
      xCol,
      yCol,
      n: Number(dt.n ?? points.length),
      r: Number(dt.r),
      rSquared: Number(dt.r) ** 2,
      pValue: typeof dt.p_value === 'number' ? dt.p_value : undefined,
      significant: Boolean(dt.significant),
      slope: reg.slope,
      intercept: reg.intercept,
      equation: reg.equation,
      interpretation: String(dt.interpretation || '') + (reg.equation ? ` Fit: ${reg.equation}` : ''),
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
    slope: reg.slope,
    intercept: reg.intercept,
    equation: reg.equation,
    interpretation: `${strengthWords(local.r)} correlation (r=${fmt(local.r)}, p=${fmtP(local.pValue)}). ${reg.equation}. Local fallback.`,
  };
}
