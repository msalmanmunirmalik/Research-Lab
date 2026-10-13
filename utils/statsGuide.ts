/**
 * Guided statistics for non-experts.
 * Profiles a sheet, asks simple research questions, recommends suitable tests.
 */

import {
  AnalysisKind,
  AnalysisReport,
  analyzeCompare,
  analyzeCorrMatrix,
  analyzeDescribe,
  analyzeMultiCompare,
  analyzeRelate,
  categoricalColumns,
  columnValues,
  combineTwoFactors,
  numericColumns,
} from './analysisEngine';
import { describe, extractGroupedValues, parseNumeric } from './researchStats';

export type ResearchGoal =
  | 'explore'
  | 'compare'
  | 'relate'
  | 'multi_compare'
  | 'corr_matrix'
  | 'factorial'
  | 'unsure';

export type GuideAnswers = {
  goal: ResearchGoal;
  /** Outcome / dependent variable */
  outcomeCol?: string;
  /** Several outcomes (multi-endpoint) */
  outcomeCols?: string[];
  /** Grouping factor (Factor A / X) */
  groupCol?: string;
  /** Second grouping factor (Factor B) for factorial A×B */
  groupColB?: string;
  /** Predictor for correlation */
  xCol?: string;
  /** Outcome for correlation (may mirror outcomeCol) */
  yCol?: string;
  /** Columns for correlation matrix */
  matrixCols?: string[];
};

export type ColumnProfile = {
  name: string;
  kind: 'numeric' | 'factor' | 'other';
  n: number;
  unique?: number;
  mean?: number;
  sd?: number;
  levels?: string[];
};

export type DatasetProfile = {
  rowCount: number;
  columns: ColumnProfile[];
  numeric: string[];
  factors: string[];
  suggestedOutcome: string;
  suggestedFactor: string;
  suggestedX: string;
  suggestedY: string;
  summary: string;
};

export type RecommendedTest = {
  id: string;
  kind: AnalysisKind;
  title: string;
  plainWhy: string;
  /** The research/lab decision this test informs */
  decision: string;
  /** What a “positive” / significant result would mean */
  ifYes: string;
  /** What a non-significant / weak result would mean */
  ifNo: string;
  technical: string;
  chartHint: string;
  confidence: 'high' | 'medium' | 'low';
  priority: number;
  valueCol?: string;
  /** Several outcomes for multi-endpoint comparison */
  valueCols?: string[];
  groupCol?: string;
  /** Second grouping factor for factorial / A×B snapshot */
  groupColB?: string;
  xCol?: string;
  yCol?: string;
  /** Columns included in a correlation matrix */
  matrixCols?: string[];
  selected: boolean;
};

export type DataInsight = {
  id: string;
  tone: 'info' | 'opportunity' | 'caution';
  title: string;
  detail: string;
};

export type DataBriefing = {
  profile: DatasetProfile;
  /** One-line situation assessment */
  situation: string;
  /** What we noticed in the numbers (pre-test) */
  insights: DataInsight[];
  /** Ranked decisions the scientist can make with this sheet */
  decisionsYouCanMake: string[];
  /** What would strengthen the analysis */
  gaps: string[];
  recommendedGoal: ResearchGoal;
};

export type GuidePlan = {
  profile: DatasetProfile;
  briefing: DataBriefing;
  recommendations: RecommendedTest[];
  headline: string;
  nextHint: string;
};

function uniqueLevels(headers: string[], rows: string[][], col: string): string[] {
  const i = headers.indexOf(col);
  if (i < 0) return [];
  const set = new Set<string>();
  rows.forEach((r) => {
    const v = String(r[i] ?? '').trim();
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

function varianceScore(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
}

/** Profile a matrix for guided recommendations. */
export function profileDataset(headers: string[], rows: string[][]): DatasetProfile {
  const filled = rows.filter((r) => r.some((c) => String(c ?? '').trim()));
  const numeric = numericColumns(headers, rows);
  const factors = categoricalColumns(headers, rows);

  const columns: ColumnProfile[] = headers
    .filter((h) => String(h || '').trim())
    .map((name) => {
      if (numeric.includes(name)) {
        const vals = columnValues(headers, rows, name);
        const d = describe(vals);
        return {
          name,
          kind: 'numeric' as const,
          n: d.n,
          mean: d.mean,
          sd: d.sd,
        };
      }
      if (factors.includes(name)) {
        const levels = uniqueLevels(headers, rows, name);
        return {
          name,
          kind: 'factor' as const,
          n: filled.length,
          unique: levels.length,
          levels: levels.slice(0, 12),
        };
      }
      return { name, kind: 'other' as const, n: filled.length };
    });

  // Prefer outcome = numeric with highest variance; factor = most balanced 2–6 levels
  let suggestedOutcome = numeric[0] || '';
  let bestVar = -1;
  for (const col of numeric) {
    const score = varianceScore(columnValues(headers, rows, col));
    if (score > bestVar) {
      bestVar = score;
      suggestedOutcome = col;
    }
  }

  let suggestedFactor = factors[0] || '';
  let bestFactorScore = -1;
  for (const col of factors) {
    const levels = uniqueLevels(headers, rows, col);
    if (levels.length < 2 || levels.length > 8) continue;
    const grouped = extractGroupedValues(headers, rows, col, suggestedOutcome || numeric[0] || '');
    const sizes = Array.from(grouped.values()).map((a) => a.length);
    if (sizes.length < 2) continue;
    const minN = Math.min(...sizes);
    const score = minN * 10 - Math.abs(levels.length - 3);
    if (score > bestFactorScore) {
      bestFactorScore = score;
      suggestedFactor = col;
    }
  }

  const otherNumeric = numeric.filter((c) => c !== suggestedOutcome);
  const suggestedX =
    otherNumeric.find((c) => /dose|time|conc|age|x|day|week/i.test(c)) ||
    otherNumeric[0] ||
    suggestedOutcome;
  const suggestedY =
    suggestedOutcome && suggestedOutcome !== suggestedX
      ? suggestedOutcome
      : otherNumeric.find((c) => c !== suggestedX) || suggestedOutcome;

  const summaryParts = [
    `${filled.length} rows`,
    `${numeric.length} numeric`,
    `${factors.length} group column${factors.length === 1 ? '' : 's'}`,
  ];
  if (suggestedFactor && suggestedOutcome) {
    summaryParts.push(`likely compare ${suggestedOutcome} by ${suggestedFactor}`);
  } else if (numeric.length >= 2) {
    summaryParts.push(`likely relate ${suggestedX} → ${suggestedY}`);
  }

  return {
    rowCount: filled.length,
    columns,
    numeric,
    factors,
    suggestedOutcome,
    suggestedFactor,
    suggestedX,
    suggestedY,
    summary: summaryParts.join(' · '),
  };
}

export const GOAL_OPTIONS: {
  id: ResearchGoal;
  label: string;
  hint: string;
}[] = [
  {
    id: 'explore',
    label: 'Just show me what the numbers look like',
    hint: 'Averages, spread, and a simple distribution chart',
  },
  {
    id: 'compare',
    label: 'Compare groups or treatments',
    hint: 'e.g. Control vs Treatment — are the means different?',
  },
  {
    id: 'relate',
    label: 'See if two measurements go together',
    hint: 'e.g. Does dose relate to response?',
  },
  {
    id: 'unsure',
    label: 'I’m not sure — suggest what’s suitable',
    hint: 'We’ll recommend based on your columns',
  },
];

/** Pre-test briefing: what the sheet supports and which decisions are available. */
export function buildDataBriefing(headers: string[], rows: string[][]): DataBriefing {
  const profile = profileDataset(headers, rows);
  const insights: DataInsight[] = [];
  const decisions: string[] = [];
  const gaps: string[] = [];

  insights.push({
    id: 'shape',
    tone: 'info',
    title: 'Dataset shape',
    detail: `${profile.rowCount} observations · ${profile.numeric.length} continuous · ${profile.factors.length} grouping factor${profile.factors.length === 1 ? '' : 's'}.`,
  });

  const outcome = profile.suggestedOutcome;
  if (outcome) {
    const col = profile.columns.find((c) => c.name === outcome);
    if (col?.kind === 'numeric' && col.n > 0 && col.mean != null && col.sd != null) {
      const cv = col.mean !== 0 ? Math.abs(col.sd / col.mean) : 0;
      insights.push({
        id: 'outcome',
        tone: cv > 0.4 ? 'opportunity' : 'info',
        title: `Primary signal: ${outcome}`,
        detail: `Mean ≈ ${col.mean.toPrecision(3)}, SD ≈ ${col.sd.toPrecision(3)} (n=${col.n})${
          cv > 0.4 ? ' — noticeable spread, so group/dose effects are worth testing.' : ' — fairly tight around the mean.'
        }`,
      });
      decisions.push(`Is ${outcome} behaving as expected, or is the distribution odd (outliers / skew)?`);
    }
  }

  const factor = profile.suggestedFactor;
  if (factor && outcome) {
    const levels = uniqueLevels(headers, rows, factor);
    const grouped = extractGroupedValues(headers, rows, factor, outcome);
    const sizes = levels.map((g) => ({ g, n: (grouped.get(g) || []).length }));
    const minN = sizes.length ? Math.min(...sizes.map((s) => s.n)) : 0;
    const maxN = sizes.length ? Math.max(...sizes.map((s) => s.n)) : 0;
    const sizeLabel = sizes.map((s) => `${s.g} (n=${s.n})`).join(', ');
    const ready = levels.length >= 2 && minN >= 3;
    insights.push({
      id: 'groups',
      tone: ready ? 'opportunity' : minN >= 2 ? 'caution' : 'caution',
      title: ready ? 'Ready for group comparison' : 'Group comparison is limited',
      detail: `“${factor}” has ${levels.length} levels: ${sizeLabel}.${
        ready
          ? ' Sample sizes look usable for a t-test/ANOVA.'
          : minN < 2
            ? ' Some groups have almost no replicates — results will be weak.'
            : ' Small n — treat p-values cautiously.'
      }`,
    });
    decisions.push(
      `Did ${factor} change ${outcome}? (e.g. is treatment different from control?)`
    );
    if (maxN / Math.max(minN, 1) >= 3) {
      gaps.push(`Group sizes are unbalanced (${sizeLabel}). Consider more replicates in the smaller group.`);
    }
    if (minN < 3) {
      gaps.push(`Aim for ≥3–5 replicates per ${factor} level before trusting significance.`);
    }
  } else if (!factor) {
    gaps.push('No clear grouping column (Condition / Treatment). Add one to decide if groups differ.');
  }

  if (profile.numeric.length >= 2) {
    const x = profile.suggestedX;
    const y = profile.suggestedY;
    if (x && y && x !== y) {
      insights.push({
        id: 'relate',
        tone: 'opportunity',
        title: 'Relationship check available',
        detail: `You can test whether “${x}” tracks with “${y}” (dose–response / association).`,
      });
      decisions.push(`Does ${x} predict ${y}? Is there a usable trend for planning the next experiment?`);
    }
  } else {
    gaps.push('Only one numeric column — add a second (dose, time, second readout) to study associations.');
  }

  if (factor && profile.numeric.length >= 2) {
    insights.push({
      id: 'multi_endpoint',
      tone: 'opportunity',
      title: 'Multi-endpoint comparison possible',
      detail: `One grouping factor (“${factor}”) with ${profile.numeric.length} numeric readouts — you can ask which outcomes actually respond (multi-endpoint panel).`,
    });
    decisions.push(
      `Which of my ${profile.numeric.length} outcomes actually change with ${factor}?`
    );
  }

  if (profile.factors.length >= 2 && outcome) {
    const [fa, fb] = profile.factors;
    insights.push({
      id: 'factorial',
      tone: 'opportunity',
      title: 'Factorial design detected',
      detail: `Two grouping factors (“${fa}” and “${fb}”). Technically this is a two-way / factorial layout — you can study each factor and their combinations (A×B cells).`,
    });
    decisions.push(
      `Do ${fa} and ${fb} both matter for ${outcome}, or only their combination?`
    );
  }

  if (profile.numeric.length >= 3) {
    insights.push({
      id: 'corr_matrix',
      tone: 'info',
      title: 'Many numeric variables',
      detail: `${profile.numeric.length} continuous columns — a correlation matrix shows which measurements move together (and which are redundant).`,
    });
    decisions.push('Which readouts are correlated, and which tell an independent story?');
  }

  if (profile.rowCount < 6) {
    gaps.push('Very small dataset — prioritize descriptives and plots; avoid over-interpreting p-values.');
  }

  let recommendedGoal: ResearchGoal = 'explore';
  if (profile.factors.length >= 2 && outcome) recommendedGoal = 'factorial';
  else if (factor && profile.numeric.length >= 2) recommendedGoal = 'multi_compare';
  else if (factor && outcome) recommendedGoal = 'compare';
  else if (profile.numeric.length >= 3) recommendedGoal = 'corr_matrix';
  else if (profile.numeric.length >= 2) recommendedGoal = 'relate';

  const situation =
    recommendedGoal === 'factorial'
      ? `Best next move: treat this as a factorial design (“${profile.factors[0]}” × “${profile.factors[1]}”) and see which combinations move “${outcome}”.`
      : recommendedGoal === 'multi_compare'
        ? `Best next move: compare all numeric outcomes across “${factor}” (multi-endpoint panel).`
        : recommendedGoal === 'corr_matrix'
          ? `Best next move: map how your ${profile.numeric.length} numeric columns relate to each other.`
          : recommendedGoal === 'compare'
            ? `Best next move: test whether “${outcome}” differs across “${factor}”.`
            : recommendedGoal === 'relate'
              ? `Best next move: check how “${profile.suggestedX}” relates to “${profile.suggestedY}”.`
              : `Best next move: summarize “${outcome || 'your measurements'}” so you know the baseline.`;

  return {
    profile,
    situation,
    insights,
    decisionsYouCanMake: decisions.slice(0, 4),
    gaps: gaps.slice(0, 4),
    recommendedGoal,
  };
}

/** Build a recommended analysis plan from profile + user answers. */
export function buildGuidePlan(
  headers: string[],
  rows: string[][],
  answers: GuideAnswers
): GuidePlan {
  const briefing = buildDataBriefing(headers, rows);
  const profile = briefing.profile;
  const outcome = answers.outcomeCol || profile.suggestedOutcome;
  const group = answers.groupCol || profile.suggestedFactor;
  const groupB =
    answers.groupColB ||
    profile.factors.find((f) => f !== group) ||
    profile.factors[1] ||
    '';
  const outcomeCols =
    answers.outcomeCols?.filter((c) => profile.numeric.includes(c)).length
      ? answers.outcomeCols.filter((c) => profile.numeric.includes(c))
      : profile.numeric.slice(0, 6);
  const matrixCols =
    answers.matrixCols?.filter((c) => profile.numeric.includes(c)).length
      ? answers.matrixCols.filter((c) => profile.numeric.includes(c))
      : profile.numeric.slice(0, 6);
  const xCol = answers.xCol || profile.suggestedX;
  const yCol = answers.yCol || profile.suggestedY || outcome;

  const recs: RecommendedTest[] = [];
  const goal = answers.goal === 'unsure' ? briefing.recommendedGoal : answers.goal;

  const wantExplore = goal === 'explore' || answers.goal === 'unsure';
  const wantCompare =
    goal === 'compare' ||
    (answers.goal === 'unsure' &&
      Boolean(group && outcome) &&
      profile.numeric.length === 1 &&
      profile.factors.length < 2);
  const wantMultiCompare =
    goal === 'multi_compare' ||
    (answers.goal === 'unsure' && Boolean(group) && profile.numeric.length >= 2);
  const wantRelate =
    goal === 'relate' ||
    (answers.goal === 'unsure' && profile.numeric.length === 2 && !group);
  const wantCorrMatrix =
    goal === 'corr_matrix' ||
    (answers.goal === 'unsure' && profile.numeric.length >= 3);
  const wantFactorial =
    goal === 'factorial' ||
    (answers.goal === 'unsure' && profile.factors.length >= 2 && Boolean(outcome));

  if (wantExplore && outcome) {
    recs.push({
      id: `describe:${outcome}`,
      kind: 'describe',
      title: `Baseline: describe “${outcome}”`,
      plainWhy: `Know the typical value and spread before comparing groups or fitting trends.`,
      decision: `Can I trust ${outcome} as a clean readout (or do I need to clean / repeat)?`,
      ifYes: 'Distribution looks usable — proceed to comparison or correlation.',
      ifNo: 'Odd spread or outliers — inspect raw rows before deciding on an effect.',
      technical: 'Descriptive statistics (mean, median, SD, range) + histogram',
      chartHint: 'Histogram',
      confidence: 'high',
      priority: 1,
      valueCol: outcome,
      selected: true,
    });
  }

  if (wantCompare && group && outcome) {
    const levels = uniqueLevels(headers, rows, group);
    const grouped = extractGroupedValues(headers, rows, group, outcome);
    const groupNs = Array.from(grouped.values()).map((a) => a.length);
    const minN = groupNs.length ? Math.min(...groupNs) : 0;
    const testName = levels.length === 2 ? 'Welch t-test' : 'One-way ANOVA';
    const ok = levels.length >= 2 && minN >= 2;
    recs.push({
      id: `compare:${group}:${outcome}`,
      kind: 'compare',
      title: `${testName}: ${outcome} by ${group}`,
      plainWhy: ok
        ? `${levels.length} groups in “${group}” (${groupNs.join('+')} points). This is the decisive test for a treatment/condition effect.`
        : `Groups look thin — run only as exploratory; add replicates before a firm call.`,
      decision: `Should I claim that ${group} changes ${outcome}?`,
      ifYes: `Evidence of a difference — worth highlighting in Results and planning a follow-up / power check.`,
      ifNo: `No clear difference with this n — do not overclaim; consider more replicates or a different endpoint.`,
      technical: `${testName} on ${outcome} ~ ${group}`,
      chartHint: 'Bar chart (mean ± SEM)',
      confidence: ok ? (minN >= 3 ? 'high' : 'medium') : 'low',
      priority: 0,
      valueCol: outcome,
      groupCol: group,
      selected: ok,
    });
  } else if (answers.goal === 'compare' && !group) {
    recs.push({
      id: 'compare:blocked',
      kind: 'compare',
      title: 'Group comparison (needs a category column)',
      plainWhy:
        'Add a text column like Condition or Treatment with group labels, then we can run a t-test or ANOVA.',
      decision: 'Cannot decide on a group effect until a factor column exists.',
      ifYes: '—',
      ifNo: '—',
      technical: 'Blocked — no factor column',
      chartHint: '—',
      confidence: 'low',
      priority: 9,
      selected: false,
    });
  }

  if (wantMultiCompare && group && outcomeCols.length >= 2) {
    recs.push({
      id: `multi_compare:${group}:${outcomeCols.join(',')}`,
      kind: 'multi_compare',
      title: `Multi-endpoint: ${group} across ${outcomeCols.length} outcomes`,
      plainWhy: `Compares selected numeric readouts by “${group}” (one factor → many Ys). Shows which endpoints actually move.`,
      decision: `Which outcomes are worth claiming as ${group}-dependent?`,
      ifYes: 'Highlight the endpoints that differ; de-prioritize flat ones in the paper/next run.',
      ifNo: 'No endpoint clears a difference — don’t cherrypick a single noisy Y.',
      technical: 'Per-outcome Welch t-test / one-way ANOVA (multi-endpoint panel)',
      chartHint: 'Panel of mean ± SEM bars',
      confidence: 'high',
      priority: goal === 'multi_compare' ? 0 : 1,
      groupCol: group,
      valueCols: outcomeCols,
      selected: true,
    });
  }

  if (wantFactorial && group && groupB && group !== groupB && outcome) {
    recs.push({
      id: `factorial:${group}x${groupB}:${outcome}`,
      kind: 'compare',
      title: `Factorial snapshot: ${group} × ${groupB} on ${outcome}`,
      plainWhy: `Two grouping factors. Classic name: two-way / factorial ANOVA. We compare all ${group}×${groupB} combination cells on “${outcome}” as an exploratory view.`,
      decision: `Do combinations of ${group} and ${groupB} change ${outcome} (not just one factor alone)?`,
      ifYes: 'Cell differences exist — follow up with a proper two-way ANOVA / interaction model for the paper.',
      ifNo: 'No clear A×B pattern here — factors may be weak or n too small for interactions.',
      technical: 'Exploratory one-way ANOVA on combined A×B cells (not a full two-way model)',
      chartHint: 'Bar chart of A×B cells',
      confidence: 'medium',
      priority: goal === 'factorial' ? 0 : 2,
      groupCol: group,
      groupColB: groupB,
      valueCol: outcome,
      selected: goal === 'factorial' || answers.goal === 'unsure',
    });
  }

  if (wantRelate && xCol && yCol && xCol !== yCol) {
    const pts = rows.filter((r) => {
      const xi = headers.indexOf(xCol);
      const yi = headers.indexOf(yCol);
      return parseNumeric(r[xi]) != null && parseNumeric(r[yi]) != null;
    }).length;
    const ok = pts >= 3;
    recs.push({
      id: `relate:${xCol}:${yCol}`,
      kind: 'relate',
      title: `Trend: ${xCol} → ${yCol}`,
      plainWhy: ok
        ? `Shows whether changing ${xCol} systematically moves ${yCol} — useful for dose/time planning.`
        : 'Need at least 3 paired numeric rows for correlation.',
      decision: `Is ${xCol} a useful lever for ${yCol} in the next experiment?`,
      ifYes: 'Clear trend — report association and consider it when choosing doses/timepoints.',
      ifNo: 'Weak/no trend — don’t assume a linear dose–response from this sheet alone.',
      technical: 'Pearson correlation + linear regression',
      chartHint: 'Scatter + fit line',
      confidence: ok ? (pts >= 8 ? 'high' : 'medium') : 'low',
      priority: goal === 'relate' ? 0 : 3,
      xCol,
      yCol,
      selected: ok && (goal === 'relate' || answers.goal === 'unsure'),
    });
  }

  if (wantCorrMatrix && matrixCols.length >= 2) {
    recs.push({
      id: `corr_matrix:${matrixCols.join(',')}`,
      kind: 'corr_matrix',
      title: `Correlation matrix (${matrixCols.length} variables)`,
      plainWhy:
        'Maps selected numeric columns against each other — the tool for “many X vs many Y” when variables are continuous.',
      decision: 'Which measurements move together, and which are independent signals?',
      ifYes: 'Strong pairs can be reported; redundant assays can be simplified.',
      ifNo: 'Mostly independent readouts — keep them as separate endpoints.',
      technical: 'Pairwise Pearson correlations',
      chartHint: 'Correlation heatmap',
      confidence: 'high',
      priority: goal === 'corr_matrix' ? 0 : 2,
      matrixCols,
      selected: goal === 'corr_matrix' || (answers.goal === 'unsure' && matrixCols.length >= 3),
    });
  }

  if (!recs.length && outcome) {
    recs.push({
      id: `describe:${outcome}`,
      kind: 'describe',
      title: `Describe “${outcome}”`,
      plainWhy: 'Safe default: summarize your main numeric column.',
      decision: `What is a normal range for ${outcome} in this run?`,
      ifYes: 'You have a baseline to compare future runs against.',
      ifNo: 'Collect more points before deciding.',
      technical: 'Descriptive statistics',
      chartHint: 'Histogram',
      confidence: 'high',
      priority: 1,
      valueCol: outcome,
      selected: true,
    });
  }

  recs.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  let headline = briefing.situation;
  if (answers.goal === 'compare') headline = `Decision focus: does “${group}” change “${outcome}”?`;
  if (answers.goal === 'multi_compare') {
    headline = `Decision focus: which outcomes change with “${group}”?`;
  }
  if (answers.goal === 'factorial') {
    headline = `Decision focus: factorial pattern of “${group}” × “${groupB}”`;
  }
  if (answers.goal === 'corr_matrix') {
    headline = 'Decision focus: which numeric variables move together?';
  }
  if (answers.goal === 'relate') headline = `Decision focus: does “${xCol}” drive “${yCol}”?`;
  if (answers.goal === 'explore') headline = `Decision focus: understand the baseline for “${outcome}”.`;

  return {
    profile,
    briefing,
    recommendations: recs,
    headline,
    nextHint: 'Run the selected tests to turn these decisions into evidence.',
  };
}

/** Run selected recommendations and return reports. */
export async function runGuideRecommendations(
  headers: string[],
  rows: string[][],
  recommendations: RecommendedTest[]
): Promise<{ report: AnalysisReport; meta: RecommendedTest }[]> {
  const selected = recommendations.filter((r) => r.selected && r.id !== 'compare:blocked');
  const out: { report: AnalysisReport; meta: RecommendedTest }[] = [];
  for (const rec of selected) {
    if (rec.kind === 'describe' && rec.valueCol) {
      out.push({ report: await analyzeDescribe(headers, rows, rec.valueCol), meta: rec });
    } else if (rec.kind === 'compare' && rec.groupCol && rec.valueCol && rec.groupColB) {
      const combined = combineTwoFactors(headers, rows, rec.groupCol, rec.groupColB, 'A×B');
      out.push({
        report: await analyzeCompare(combined.headers, combined.rows, 'A×B', rec.valueCol),
        meta: rec,
      });
    } else if (rec.kind === 'compare' && rec.groupCol && rec.valueCol) {
      out.push({
        report: await analyzeCompare(headers, rows, rec.groupCol, rec.valueCol),
        meta: rec,
      });
    } else if (rec.kind === 'multi_compare' && rec.groupCol && rec.valueCols?.length) {
      out.push({
        report: await analyzeMultiCompare(headers, rows, rec.groupCol, rec.valueCols),
        meta: rec,
      });
    } else if (rec.kind === 'relate' && rec.xCol && rec.yCol) {
      out.push({ report: await analyzeRelate(headers, rows, rec.xCol, rec.yCol), meta: rec });
    } else if (rec.kind === 'corr_matrix' && rec.matrixCols?.length) {
      out.push({
        report: await analyzeCorrMatrix(headers, rows, rec.matrixCols),
        meta: rec,
      });
    }
  }
  return out;
}

/** Plain-language takeaway without AI. */
export function plainTakeaway(report: AnalysisReport): string {
  if (report.kind === 'describe') {
    return `On average, ${report.column} is about ${report.mean.toPrecision(3)} (median ${report.median.toPrecision(3)}). Values typically sit within ±${report.stdDev.toPrecision(3)} of the mean (n=${report.n}).`;
  }
  if (report.kind === 'compare') {
    const means = report.groups.map((g) => `${g.group}: ${g.mean.toPrecision(3)}`).join('; ');
    if (report.significant) {
      return `Decision support: groups differ (${report.test}, p=${report.pValue < 0.0001 ? '<0.0001' : report.pValue.toFixed(4)}). Means — ${means}.`;
    }
    return `Decision support: no clear group difference with this sample (${report.test}, p=${report.pValue.toFixed(4)}). Means — ${means}.`;
  }
  if (report.kind === 'multi_compare') {
    return report.interpretation;
  }
  if (report.kind === 'corr_matrix') {
    return report.interpretation;
  }
  const dir =
    report.r >= 0.3 ? 'positive' : report.r <= -0.3 ? 'negative' : 'little clear';
  return `Decision support: ${dir} association between ${report.xCol} and ${report.yCol} (r=${report.r.toFixed(3)}${
    report.pValue != null ? `, p=${report.pValue < 0.0001 ? '<0.0001' : report.pValue.toFixed(4)}` : ''
  }). ${report.equation || ''}`;
}

/** Pair a report with its recommendation for a decision card. */
export function decisionCard(
  report: AnalysisReport,
  meta: RecommendedTest
): { verdict: string; action: string } {
  if (report.kind === 'describe') {
    return {
      verdict: plainTakeaway(report),
      action: meta.ifYes,
    };
  }
  if (report.kind === 'multi_compare') {
    const positive = report.significantOutcomes.length > 0;
    return {
      verdict: plainTakeaway(report),
      action: positive ? meta.ifYes : meta.ifNo,
    };
  }
  if (report.kind === 'corr_matrix') {
    const positive = Boolean(report.strongest && Math.abs(report.strongest.r) >= 0.3);
    return {
      verdict: plainTakeaway(report),
      action: positive ? meta.ifYes : meta.ifNo,
    };
  }
  if (report.kind === 'compare' || report.kind === 'relate') {
    const positive =
      report.kind === 'compare'
        ? report.significant
        : Boolean(report.significant || (report.r != null && Math.abs(report.r) >= 0.3));
    return {
      verdict: plainTakeaway(report),
      action: positive ? meta.ifYes : meta.ifNo,
    };
  }
  return { verdict: plainTakeaway(report), action: meta.ifYes };
}

export function profileContextForAI(
  profile: DatasetProfile,
  answers: GuideAnswers,
  briefing?: DataBriefing,
  userIntent?: string
): string {
  const cols = profile.columns
    .map((c) => {
      if (c.kind === 'numeric') {
        return `- ${c.name} [numeric] n=${c.n} mean=${c.mean?.toFixed?.(3)} sd=${c.sd?.toFixed?.(3)}`;
      }
      if (c.kind === 'factor') {
        return `- ${c.name} [factor] levels=${(c.levels || []).join('|')}`;
      }
      return `- ${c.name} [other]`;
    })
    .join('\n');
  const brief = briefing
    ? [
        `Situation: ${briefing.situation}`,
        `Insights: ${briefing.insights.map((i) => i.title + ': ' + i.detail).join(' | ')}`,
        `Decisions possible: ${briefing.decisionsYouCanMake.join(' | ')}`,
        `Gaps: ${briefing.gaps.join(' | ') || 'none'}`,
      ].join('\n')
    : '';
  return [
    userIntent ? `Scientist request: ${userIntent}` : '',
    `Rows: ${profile.rowCount}`,
    `User goal: ${answers.goal}`,
    `Chosen outcome: ${answers.outcomeCol || profile.suggestedOutcome}`,
    `Chosen group: ${answers.groupCol || profile.suggestedFactor || '—'}`,
    `Chosen Factor B: ${answers.groupColB || '—'}`,
    `Chosen X/Y: ${answers.xCol || profile.suggestedX} / ${answers.yCol || profile.suggestedY}`,
    answers.outcomeCols?.length ? `Outcomes: ${answers.outcomeCols.join(', ')}` : '',
    answers.matrixCols?.length ? `Matrix cols: ${answers.matrixCols.join(', ')}` : '',
    brief,
    'Columns:',
    cols,
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeColToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Match column names mentioned in free text (case/spacing insensitive). */
export function findMentionedColumns(text: string, columnNames: string[]): string[] {
  const lower = text.toLowerCase();
  const scored = columnNames
    .map((name) => {
      const n = name.toLowerCase();
      const compact = normalizeColToken(name);
      let hit = 0;
      if (n.length >= 2 && lower.includes(n)) hit = n.length;
      else if (compact.length >= 2 && normalizeColToken(text).includes(compact)) hit = compact.length;
      return { name, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  // Prefer longer matches; drop substrings of longer hits
  const out: string[] = [];
  for (const s of scored) {
    if (out.some((o) => normalizeColToken(o).includes(normalizeColToken(s.name)) && o !== s.name)) {
      continue;
    }
    out.push(s.name);
  }
  return out;
}

export type ParsedStatsIntent = {
  goal: ResearchGoal;
  answers: Partial<GuideAnswers>;
  mentioned: string[];
  note: string;
};

/**
 * Parse a scientist's free-text ask into a goal + column picks (no AI tokens).
 * Examples: "correlation between agr and egfr", "relationship between fibrinogen and Age".
 */
export function parseUserStatsIntent(
  text: string,
  profile: DatasetProfile
): ParsedStatsIntent {
  const note = text.trim();
  const lower = note.toLowerCase();
  const mentioned = findMentionedColumns(note, [
    ...profile.numeric,
    ...profile.factors,
    ...profile.columns.map((c) => c.name),
  ]);
  const uniqueMentioned = [...new Set(mentioned)];
  const numericMentioned = uniqueMentioned.filter((c) => profile.numeric.includes(c));
  const factorMentioned = uniqueMentioned.filter((c) => profile.factors.includes(c));

  const wantsCorr =
    /\b(correlat|association|associat|relationship|relate|trend|linear|pearson|spearman|regress)/i.test(
      lower
    );
  const wantsCompare =
    /\b(compar|difference|differ|vs\.?|versus|between groups|t-?test|anova|effect of|treatment|condition)/i.test(
      lower
    );
  const wantsDescribe =
    /\b(descript|summar|baseline|distribution|histogram|mean|spread)/i.test(lower);
  const wantsFactorial =
    /\b(factorial|two[- ]way|interaction|a\s*[×x]\s*b|two factors)/i.test(lower);
  const wantsMatrix =
    /\b(matrix|heatmap|all (pairs|variables)|many (variables|outcomes|columns))/i.test(lower);
  const wantsMulti =
    /\b(multi[- ]?endpoint|several outcomes|multiple outcomes|across outcomes)/i.test(lower);

  let goal: ResearchGoal = 'unsure';
  if (wantsFactorial) goal = 'factorial';
  else if (wantsMatrix) goal = 'corr_matrix';
  else if (wantsMulti) goal = 'multi_compare';
  else if (wantsCorr) goal = numericMentioned.length >= 3 ? 'corr_matrix' : 'relate';
  else if (wantsCompare) goal = 'compare';
  else if (wantsDescribe) goal = 'explore';
  else if (numericMentioned.length >= 2 && factorMentioned.length === 0) goal = 'relate';
  else if (factorMentioned.length >= 1 && numericMentioned.length >= 1) goal = 'compare';

  const answers: Partial<GuideAnswers> = { goal };

  if (goal === 'relate' && numericMentioned.length >= 2) {
    answers.xCol = numericMentioned[0];
    answers.yCol = numericMentioned[1];
    answers.outcomeCol = numericMentioned[1];
  } else if (goal === 'corr_matrix') {
    answers.matrixCols =
      numericMentioned.length >= 2 ? numericMentioned : profile.numeric.slice(0, 6);
    if (numericMentioned.length >= 2) {
      answers.xCol = numericMentioned[0];
      answers.yCol = numericMentioned[1];
    }
  } else if (goal === 'compare' || goal === 'multi_compare' || goal === 'factorial') {
    if (factorMentioned[0]) answers.groupCol = factorMentioned[0];
    if (factorMentioned[1]) answers.groupColB = factorMentioned[1];
    if (numericMentioned[0]) answers.outcomeCol = numericMentioned[0];
    if (numericMentioned.length >= 2) answers.outcomeCols = numericMentioned;
  } else if (goal === 'explore' && numericMentioned[0]) {
    answers.outcomeCol = numericMentioned[0];
  } else if (numericMentioned.length >= 2) {
    // Fallback: treat as relate when two numbers are named
    answers.xCol = numericMentioned[0];
    answers.yCol = numericMentioned[1];
    if (goal === 'unsure') {
      goal = 'relate';
      answers.goal = 'relate';
    }
  }

  return { goal, answers, mentioned: uniqueMentioned, note };
}
