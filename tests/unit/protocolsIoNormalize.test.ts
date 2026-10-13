import { attributionText, normalizeProtocol } from '../../server/services/protocols/protocolsIoNormalize';

describe('protocols.io normalization', () => {
  const retrievedAt = '2026-10-04T05:00:00.000Z';

  it('keeps source, CC-BY, DOI, and the original URL', () => {
    const protocol = normalizeProtocol(
      {
        id: 42,
        title_html: '<b>PCR</b> master mix',
        description: 'Amplify a short product.',
        doi: 'https://doi.org/10.17504/protocols.io.example',
        url: 'https://www.protocols.io/view/pcr-example',
        uri: 'pcr-example',
        version_id: 2,
        published_on: 1600000000,
        authors: [{ name: 'A. Scientist' }],
        warning: 'Wear gloves.',
        materials: [{ name: 'Taq polymerase' }],
        steps: [{ title: 'Denature', step: 'Heat to 95 C.', duration: 30, warning: 'Hot block' }],
      },
      retrievedAt
    );

    expect(protocol).toMatchObject({
      source: 'protocols.io',
      externalId: '42',
      title: 'PCR master mix',
      doi: '10.17504/protocols.io.example',
      sourceUrl: 'https://www.protocols.io/view/pcr-example',
      license: 'CC-BY',
      version: '3',
      authors: ['A. Scientist'],
      retrievedAt,
    });
    expect(protocol?.steps[0]).toMatchObject({
      title: 'Denature',
      description: 'Heat to 95 C.',
      warnings: ['Hot block'],
    });
    expect(protocol?.materials).toEqual([{ name: 'Taq polymerase' }]);
    expect(protocol?.safetyNotes).toContain('Wear gloves.');
  });

  it('writes attribution that names the original and the license', () => {
    const protocol = normalizeProtocol(
      {
        id: 'abc',
        title: 'ELISA',
        authors: [{ name: 'B. Lab' }],
        url: 'https://www.protocols.io/view/elisa',
        doi: '10.17504/protocols.io.elisa',
      },
      retrievedAt
    );
    const text = attributionText(protocol!);
    expect(text).toContain('protocols.io');
    expect(text).toContain('B. Lab');
    expect(text).toContain('https://www.protocols.io/view/elisa');
    expect(text).toContain('10.17504/protocols.io.elisa');
    expect(text).toContain('CC-BY');
    expect(text).toContain('may differ');
  });

  it('drops a payload with no title', () => {
    expect(normalizeProtocol({ id: 1 }, retrievedAt)).toBeNull();
  });
});
