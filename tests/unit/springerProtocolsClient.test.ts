jest.mock('../../server/services/scholarly/cache', () => ({
  cacheKey: () => 'springer-test-key',
  getCached: jest.fn(async () => null),
  setCached: jest.fn(async () => undefined),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: () => false,
  },
  isAxiosError: () => false,
}));

import axios from 'axios';
import { SpringerProtocolsClient } from '../../server/services/protocols/springerProtocols';

describe('SpringerProtocols client without a key', () => {
  const previous = process.env.SPRINGER_NATURE_API_KEY;

  const previousMetadata = process.env.SPRINGER_NATURE_METADATA_API_KEY;

  beforeEach(() => {
    delete process.env.SPRINGER_NATURE_API_KEY;
    delete process.env.SPRINGER_NATURE_METADATA_API_KEY;
    (axios.get as jest.Mock).mockClear();
  });

  afterAll(() => {
    if (previous) process.env.SPRINGER_NATURE_API_KEY = previous;
    if (previousMetadata) process.env.SPRINGER_NATURE_METADATA_API_KEY = previousMetadata;
  });

  it('returns no metadata and does not call Springer', async () => {
    const result = await SpringerProtocolsClient.search('PCR');
    expect(result.missingKey).toBe(true);
    expect(result.protocols).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
