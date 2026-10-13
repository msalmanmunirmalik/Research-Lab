import {
  dedupeSpringerRecords,
  normalizeSpringerRecord,
  springerSearchQuery,
  toCanonicalPaper,
} from '../../server/services/protocols/springerNormalize';

describe('SpringerProtocols metadata', () => {
  const retrievedAt = '2026-10-04T05:00:00.000Z';

  const chapter = {
    title: 'A protocol for PCR cleanup',
    creators: [{ creator: 'A. Scientist' }],
    abstract: 'This chapter describes a cleanup method.',
    doi: '10.1007/978-1-4939-0000-1_1',
    identifier: 'doi:10.1007/978-1-4939-0000-1_1',
    publicationName: 'Methods in Molecular Biology',
    publisher: 'Springer',
    publicationDate: '2020-05-01',
    url: [{ value: 'https://link.springer.com/protocol/10.1007/978-1-4939-0000-1_1' }],
    subjects: ['PCR'],
    body: 'Step 1. Do not store this.',
  };

  it('keeps metadata and drops the body', () => {
    const record = normalizeSpringerRecord(chapter, retrievedAt);
    expect(record).toMatchObject({
      source: 'springer_protocols',
      title: 'A protocol for PCR cleanup',
      doi: '10.1007/978-1-4939-0000-1_1',
      series: 'Methods in Molecular Biology',
      publisher: 'Springer',
      sourceUrl: 'https://link.springer.com/protocol/10.1007/978-1-4939-0000-1_1',
      authors: ['A. Scientist'],
      retrievedAt,
    });
    expect(record?.abstract).toContain('cleanup method');
    expect(JSON.stringify(record)).not.toContain('Do not store this');
  });

  it('drops an abstract that is really a procedure', () => {
    const record = normalizeSpringerRecord(
      {
        ...chapter,
        abstract: 'Step 1 heat. Step 2 cool. Step 3 wash. Step 4 elute.',
      },
      retrievedAt
    );
    expect(record?.abstract).toBeNull();
  });

  it('ignores a record that is not a protocol or methods chapter', () => {
    expect(
      normalizeSpringerRecord({ title: 'Market report', doi: '10.1007/example', publicationName: 'Nature' }, retrievedAt)
    ).toBeNull();
  });

  it('keeps two different DOIs and collapses a duplicate', () => {
    const first = normalizeSpringerRecord(chapter, retrievedAt)!;
    const second = normalizeSpringerRecord(
      { ...chapter, title: 'Another protocol for ELISA', doi: '10.1007/978-1-4939-0000-2_2', identifier: 'doi:10.1007/978-1-4939-0000-2_2' },
      retrievedAt
    )!;
    const duplicate = { ...first };
    expect(dedupeSpringerRecords([first, duplicate, second])).toHaveLength(2);
  });

  it('does not merge different DOIs that share a title', () => {
    const first = normalizeSpringerRecord(chapter, retrievedAt)!;
    const other = normalizeSpringerRecord(
      { ...chapter, doi: '10.1007/978-1-4939-9999-9_9', identifier: 'doi:10.1007/978-1-4939-9999-9_9' },
      retrievedAt
    )!;
    expect(dedupeSpringerRecords([first, other])).toHaveLength(2);
  });

  it('builds a basic-tier protocol query', () => {
    expect(springerSearchQuery('PCR "kit"')).toBe('"PCR kit" protocol');
    expect(springerSearchQuery('PCR')).not.toContain('journal:');
  });

  it('marks the research-library copy as metadata only', () => {
    const paper = toCanonicalPaper(normalizeSpringerRecord(chapter, retrievedAt)!);
    expect(paper.metadataSource).toBe('springer_protocols');
    expect(paper.fullTextAvailable).toBe(false);
    expect(paper.pdfUrl).toBeUndefined();
    expect(paper.publicationType).toBe('protocol-metadata');
  });
});
