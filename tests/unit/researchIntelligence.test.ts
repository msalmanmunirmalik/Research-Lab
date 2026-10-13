import {
  aggregateFunders,
  assembleBrief,
  looksClinical,
  mapTopic,
  mapYearGroups,
  searchTerm,
} from '../../server/services/scholarly/intelligenceBrief';

describe('research intelligence brief', () => {
  test('maps an OpenAlex topic and keeps citation counts', () => {
    const topic = mapTopic({
      id: 'https://openalex.org/T10001',
      display_name: 'CRISPR',
      description: 'Gene editing',
      domain: { display_name: 'Life Sciences' },
      works_count: 12,
      cited_by_count: 340,
    });
    expect(topic).toMatchObject({
      id: 'T10001',
      name: 'CRISPR',
      worksCount: 12,
      citedByCount: 340,
    });
  });

  test('sorts the publication trend and keeps the recent years', () => {
    const years = mapYearGroups([
      { key: '2010', key_display_name: '2010', count: 4 },
      { key: '2024', key_display_name: '2024', count: 20 },
      { key: '2022', key_display_name: '2022', count: 11 },
    ]);
    expect(years.map((row) => row.year)).toEqual([2010, 2022, 2024]);
    expect(mapYearGroups([{ key: '2099', key_display_name: '2099', count: 1 }], 2026)).toEqual([]);
  });

  test('counts each funder once per work', () => {
    const funders = aggregateFunders([
      { grants: [{ funder_display_name: 'NIH' }, { funder_display_name: 'NIH' }] },
      { grants: [{ funder_display_name: 'NIH' }, { funder_display_name: 'Wellcome' }] },
    ]);
    expect(funders).toEqual([
      { name: 'NIH', works: 2 },
      { name: 'Wellcome', works: 1 },
    ]);
  });

  test('clinical signals stay off a non-biomedical topic', () => {
    expect(looksClinical('concrete durability', 'Physical Sciences')).toBe(false);
    expect(looksClinical('kinase inhibitors', 'Health Sciences')).toBe(true);
  });

  test('grant search text cannot carry LIKE wildcards', () => {
    expect(searchTerm('100%_match\\topic')).toBe('100 match topic');
  });

  test('a missed OpenAlex response stays unavailable and does not invent works', () => {
    const brief = assembleBrief({
      query: 'crispr',
      retrievedAt: '2026-10-04T00:00:00.000Z',
      openAlexReached: false,
      topics: [],
      trend: [],
      researchers: [],
      institutions: [],
      funders: [],
      grants: [],
      datasets: [],
      clinical: null,
      recent: [],
    });
    expect(brief.available).toBe(false);
    expect(brief.notice).toContain('still work');
    expect(brief.provenance.source).toBe('openalex');
    expect(brief.recent).toEqual([]);
  });
});
