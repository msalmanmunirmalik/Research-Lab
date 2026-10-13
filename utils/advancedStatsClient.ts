/**
 * Client for Express → Python advanced-stats service.
 * Falls back is handled by the caller when these helpers return null.
 */

export type AnalysisRow = {
  value: number;
  index: number;
  category?: string;
  group?: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postJson(path: string, body: unknown): Promise<any | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkAdvancedStatsHealth(): Promise<'healthy' | 'unhealthy' | 'unknown'> {
  try {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
    const res = await fetch('/api/advanced-stats/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return 'unhealthy';
    const json = await res.json();
    return json.status === 'healthy' ? 'healthy' : 'unhealthy';
  } catch {
    return 'unknown';
  }
}

export function rowsFromPoints(
  points: Array<{ value: number; category?: string; group?: string }>
): AnalysisRow[] {
  return points.map((point, index) => ({
    value: point.value,
    index,
    category: point.category,
    group: point.group,
  }));
}

function pickNumeric(field: unknown, column = 'value'): number | undefined {
  if (typeof field === 'number' && !Number.isNaN(field)) return field;
  if (field && typeof field === 'object' && column in (field as object)) {
    const v = (field as Record<string, unknown>)[column];
    return typeof v === 'number' ? v : Number(v);
  }
  return undefined;
}

function strengthLabel(correlation: number): { strength: string; interpretation: string } {
  const abs = Math.abs(correlation);
  if (abs >= 0.7) {
    return { strength: 'Strong', interpretation: 'Strong relationship between variables' };
  }
  if (abs >= 0.5) {
    return { strength: 'Moderate', interpretation: 'Moderate relationship between variables' };
  }
  if (abs >= 0.3) {
    return { strength: 'Weak', interpretation: 'Weak relationship between variables' };
  }
  return { strength: 'Very Weak', interpretation: 'Very weak or no relationship between variables' };
}

/** Normalize API descriptive payload into the Analysis page shape. */
export function normalizeDescriptive(api: any) {
  const stats = api?.statistics || api;
  const count = pickNumeric(stats?.count) ?? 0;
  const mean = pickNumeric(stats?.mean) ?? 0;
  const median =
    pickNumeric(stats?.percentiles?.['50%']) ??
    pickNumeric(stats?.median) ??
    mean;
  const standardDeviation = pickNumeric(stats?.std) ?? pickNumeric(stats?.standardDeviation) ?? 0;
  const min = pickNumeric(stats?.min) ?? 0;
  const max = pickNumeric(stats?.max) ?? 0;
  const q1 = pickNumeric(stats?.percentiles?.['25%']) ?? min;
  const q3 = pickNumeric(stats?.percentiles?.['75%']) ?? max;
  return {
    count,
    mean,
    median,
    mode: [] as number[],
    variance: standardDeviation * standardDeviation,
    standardDeviation,
    min,
    max,
    range: max - min,
    skewness: pickNumeric(stats?.skewness) ?? 0,
    kurtosis: pickNumeric(stats?.kurtosis) ?? 0,
    quartiles: { q1, q2: median, q3 },
    source: 'advanced-stats' as const,
  };
}

export function normalizeCorrelation(api: any) {
  const corr = api?.correlation || api;
  const matrix = corr?.matrix || corr?.correlation_matrix || {};
  let value = 0;
  if (typeof matrix === 'object' && matrix !== null) {
    const indexRow = matrix.index || matrix.Index;
    if (indexRow && typeof indexRow.value === 'number') value = indexRow.value;
    else if (matrix.value && typeof matrix.value.index === 'number') value = matrix.value.index;
  }
  if (typeof corr?.correlation === 'number') value = corr.correlation;
  const labels = strengthLabel(value);
  return {
    correlation: value,
    strength: labels.strength,
    interpretation: labels.interpretation,
    source: 'advanced-stats' as const,
  };
}

export function normalizeRegression(api: any) {
  const model = api?.model || api;
  const coeffs = model?.coefficients || {};
  const slope =
    typeof coeffs.index === 'number'
      ? coeffs.index
      : typeof coeffs === 'object'
        ? Number(Object.values(coeffs)[0] ?? 0)
        : 0;
  const intercept = Number(model?.intercept ?? 0);
  const rSquared = Number(model?.rSquared ?? model?.r_squared ?? 0);
  const adjustedRSquared = Number(model?.adjustedRSquared ?? model?.adjusted_r_squared ?? rSquared);
  let interpretation = 'Poor fit - Model explains little variance';
  if (rSquared >= 0.9) interpretation = 'Excellent fit - Model explains most of the variance';
  else if (rSquared >= 0.7) interpretation = 'Good fit - Model explains substantial variance';
  else if (rSquared >= 0.5) interpretation = 'Moderate fit - Model explains some variance';
  return {
    slope,
    intercept,
    rSquared,
    adjustedRSquared,
    standardError: 0,
    equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,
    interpretation,
    source: 'advanced-stats' as const,
  };
}

export function normalizeHypothesis(api: any) {
  const nested = api?.testResults || api?.test_results || api;
  const result =
    nested && typeof nested === 'object' && ('statistic' in nested || 'pValue' in nested || 'p_value' in nested)
      ? nested
      : Object.values(nested || {})[0] || {};
  const tStatistic = Number(result.statistic ?? result.tStatistic ?? 0);
  const pValue = Number(result.pValue ?? result.p_value ?? 1);
  const conclusion =
    result.conclusion ||
    (pValue < 0.05
      ? 'Reject null hypothesis - Groups are significantly different'
      : 'Fail to reject null hypothesis - No significant difference');
  return {
    testType: result.testType || 'Two-Sample t-Test',
    tStatistic,
    pValue,
    degreesOfFreedom: Number(result.degreesOfFreedom ?? 0),
    confidenceInterval: [0, 0] as [number, number],
    conclusion,
    source: 'advanced-stats' as const,
  };
}

export async function runAdvancedDescriptive(rows: AnalysisRow[]) {
  const api = await postJson('/api/advanced-stats/analysis/descriptive', {
    data: rows,
    columns: ['value'],
  });
  if (!api?.success && !api?.statistics) return null;
  return normalizeDescriptive(api);
}

/** Descriptive stats from a plain numeric series. */
export async function runAdvancedDescriptiveValues(values: number[]) {
  const data = values.map((value, index) => ({ value, index }));
  return runAdvancedDescriptive(data);
}

export async function runAdvancedCorrelation(rows: AnalysisRow[]) {
  const api = await postJson('/api/advanced-stats/analysis/correlation', {
    data: rows,
    method: 'pearson',
    columns: ['index', 'value'],
  });
  if (!api) return null;
  return normalizeCorrelation(api);
}

/** Pearson correlation between two equal-length series (real X vs Y). */
export async function runAdvancedCorrelationXY(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const data = Array.from({ length: n }, (_, i) => ({ x: xs[i], y: ys[i] }));
  const api = await postJson('/api/advanced-stats/analysis/correlation', {
    data,
    method: 'pearson',
    columns: ['x', 'y'],
  });
  if (!api) return null;
  const corr = api?.correlation || api;
  let value =
    typeof corr?.correlation === 'number'
      ? corr.correlation
      : typeof corr?.r === 'number'
        ? corr.r
        : typeof corr?.pearson === 'number'
          ? corr.pearson
          : NaN;
  if (!Number.isFinite(value)) {
    const matrix = corr?.matrix || corr?.correlation_matrix;
    if (matrix && typeof matrix === 'object') {
      const row = (matrix as Record<string, any>).x || (matrix as Record<string, any>).X;
      if (row && typeof row.y === 'number') value = row.y;
      else if (row && typeof row.Y === 'number') value = row.Y;
    }
  }
  if (!Number.isFinite(value)) return null;
  const labels = strengthLabel(value);
  return {
    correlation: value,
    strength: labels.strength,
    interpretation: labels.interpretation,
    source: 'advanced-stats' as const,
  };
}

export async function runAdvancedRegression(rows: AnalysisRow[]) {
  const api = await postJson('/api/advanced-stats/analysis/regression', {
    data: rows,
    targetColumn: 'value',
    featureColumns: ['index'],
  });
  if (!api) return null;
  return normalizeRegression(api);
}

/** OLS of y ~ x (real columns). */
export async function runAdvancedRegressionXY(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const data = Array.from({ length: n }, (_, i) => ({ x: xs[i], y: ys[i] }));
  const api = await postJson('/api/advanced-stats/analysis/regression', {
    data,
    targetColumn: 'y',
    featureColumns: ['x'],
  });
  if (!api) return null;
  return normalizeRegression(api);
}

export async function runAdvancedTTest(
  groupA: number[],
  groupB: number[]
) {
  const len = Math.max(groupA.length, groupB.length);
  const data = Array.from({ length: len }, (_, i) => ({
    group_a: groupA[i] ?? null,
    group_b: groupB[i] ?? null,
  }));
  const api = await postJson('/api/advanced-stats/analysis/hypothesis-testing', {
    data,
    testType: 'ttest',
    columns: ['group_a', 'group_b'],
    options: {},
  });
  if (!api) return null;
  return normalizeHypothesis(api);
}

/** One-way ANOVA via groupColumn + valueColumn on row objects. */
export async function runAdvancedAnova(
  data: Record<string, string | number>[],
  groupColumn: string,
  valueColumn: string
) {
  const api = await postJson('/api/advanced-stats/analysis/anova', {
    data,
    groupColumn,
    valueColumn,
  });
  if (!api) return null;
  const nested = api?.result || api?.anova || api?.testResults || api;
  const statistic = Number(
    nested?.F ?? nested?.f_statistic ?? nested?.statistic ?? nested?.fStatistic ?? NaN
  );
  const pValue = Number(nested?.pValue ?? nested?.p_value ?? nested?.pvalue ?? NaN);
  if (!Number.isFinite(statistic) || !Number.isFinite(pValue)) return null;
  return {
    statistic,
    pValue,
    significant: pValue < 0.05,
    source: 'advanced-stats' as const,
  };
}
