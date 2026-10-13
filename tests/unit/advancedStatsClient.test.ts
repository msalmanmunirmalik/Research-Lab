import {
  normalizeCorrelation,
  normalizeDescriptive,
  normalizeHypothesis,
  normalizeRegression,
  rowsFromPoints,
} from '../../utils/advancedStatsClient';

describe('advancedStatsClient', () => {
  test('rowsFromPoints adds index', () => {
    expect(rowsFromPoints([{ value: 1.5, group: 'A' }, { value: 2 }])).toEqual([
      { value: 1.5, index: 0, category: undefined, group: 'A' },
      { value: 2, index: 1, category: undefined, group: undefined },
    ]);
  });

  test('normalizeDescriptive reads per-column dicts', () => {
    const out = normalizeDescriptive({
      statistics: {
        count: { value: 4 },
        mean: { value: 10 },
        std: { value: 2 },
        min: { value: 5 },
        max: { value: 15 },
        percentiles: { '25%': { value: 7 }, '50%': { value: 10 }, '75%': { value: 13 } },
        skewness: { value: 0.1 },
        kurtosis: { value: -0.2 },
      },
    });
    expect(out.count).toBe(4);
    expect(out.mean).toBe(10);
    expect(out.median).toBe(10);
    expect(out.standardDeviation).toBe(2);
    expect(out.source).toBe('advanced-stats');
  });

  test('normalizeCorrelation reads matrix cell', () => {
    const out = normalizeCorrelation({
      correlation: {
        matrix: { index: { value: 0.82, index: 1 }, value: { index: 0.82, value: 1 } },
      },
    });
    expect(out.correlation).toBeCloseTo(0.82);
    expect(out.strength).toBe('Strong');
  });

  test('normalizeRegression and hypothesis', () => {
    expect(
      normalizeRegression({
        model: { coefficients: { index: 1.5, const: 2 }, intercept: 2, rSquared: 0.8 },
      }).equation
    ).toContain('1.5000');
    expect(
      normalizeHypothesis({
        testResults: { statistic: 2.1, pValue: 0.04, conclusion: 'Significant difference' },
      }).pValue
    ).toBe(0.04);
  });
});
