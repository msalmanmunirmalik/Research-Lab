import { isTokenRevoked } from '../../server/utils/tokenRevocation';

describe('isTokenRevoked', () => {
  test('null cutoff keeps tokens valid', () => {
    expect(isTokenRevoked(1_700_000_000, null)).toBe(false);
    expect(isTokenRevoked(1_700_000_000, undefined)).toBe(false);
  });

  test('missing iat is treated as revoked when a cutoff exists', () => {
    expect(isTokenRevoked(undefined, 1_700_000_000)).toBe(true);
  });

  test('tokens issued before the cutoff are revoked; same-second stays valid', () => {
    const cutoff = 1_700_000_100;
    expect(isTokenRevoked(cutoff - 1, cutoff)).toBe(true);
    expect(isTokenRevoked(cutoff, cutoff)).toBe(false);
    expect(isTokenRevoked(cutoff + 5, cutoff)).toBe(false);
  });
});
