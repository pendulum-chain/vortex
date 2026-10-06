/**
 * Reads the `exp` claim of a JWT as epoch milliseconds, without verifying the signature.
 * Returns null when the token is malformed or carries no numeric `exp`.
 */
export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    // JWT segments are base64url and usually unpadded; convert to base64 and re-pad before decoding.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}
