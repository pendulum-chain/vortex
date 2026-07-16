import crypto from "crypto";

/** Invite links stop being redeemable after this window (spec: recipient-transfers.md). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * URL-safe, single-use redemption token. The sha256 hash is the only lookup key; the raw token is
 * additionally retained while the invite is pending so the sender can re-copy the link, and is
 * cleared on acceptance/expiry (see recipient-transfers.md invariant 1).
 */
export function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Case/whitespace-insensitive form used to bind an invite to an email at redemption. */
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function inviteExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}
