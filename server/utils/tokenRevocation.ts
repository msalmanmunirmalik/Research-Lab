/**
 * Reject a JWT issued before the cutoff. iat is whole seconds, so a token issued
 * in the same second as the cutoff is still accepted. That is the clock window.
 */
export function isTokenRevoked(
  issuedAtSeconds: number | undefined,
  invalidBeforeUnix: number | null | undefined
): boolean {
  if (invalidBeforeUnix == null || Number.isNaN(Number(invalidBeforeUnix))) return false;
  if (issuedAtSeconds == null || Number.isNaN(Number(issuedAtSeconds))) return true;
  return Number(issuedAtSeconds) < Number(invalidBeforeUnix);
}
