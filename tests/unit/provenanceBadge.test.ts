import { provenanceScore } from '../../components/ProvenanceBadge';

describe('provenanceScore', () => {
  test('counts linked upstream ids', () => {
    expect(provenanceScore({})).toBe(0);
    expect(provenanceScore({ protocolId: 'p1' })).toBe(1);
    expect(
      provenanceScore({
        protocolId: 'p1',
        experimentId: 'e1',
        notebookEntryId: 'n1',
      })
    ).toBe(3);
  });
});
