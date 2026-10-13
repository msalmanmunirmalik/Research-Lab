jest.mock('../../server/services/scholarly/cache', () => ({
  cacheKey: () => 'protocols-io-test-key',
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
import { ProtocolsIoClient } from '../../server/services/protocols/protocolsIo';

describe('protocols.io client without a token', () => {
  const previous = process.env.PROTOCOLS_IO_ACCESS_TOKEN;

  beforeEach(() => {
    delete process.env.PROTOCOLS_IO_ACCESS_TOKEN;
    (axios.get as jest.Mock).mockClear();
  });

  afterAll(() => {
    if (previous) process.env.PROTOCOLS_IO_ACCESS_TOKEN = previous;
  });

  it('returns an empty search and does not call protocols.io', async () => {
    const result = await ProtocolsIoClient.search('PCR');
    expect(result.missingToken).toBe(true);
    expect(result.protocols).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
