import crypto from "crypto";

/** Invite links stop being redeemable after this window (spec: recipient-transfers.md). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** URL-safe, single-use redemption token. Only its hash is ever stored (plan D1). */
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
