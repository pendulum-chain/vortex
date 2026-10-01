import crypto from "node:crypto";

/**
 * Constant-time buffer comparison. `crypto.timingSafeEqual` throws on a length mismatch, so differing
 * lengths run a dummy same-length comparison and return false instead.
 */
export function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Compare against self to keep timing independent of the mismatch position.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
