import type { Recipient } from "./types";

/** Human-readable identifier for a recipient in tables, selectors and toasts. */
export function recipientLabel(recipient: Recipient): string {
  return recipient.name || recipient.email || `Invited · ${recipient.inviteCode}`;
}

/** Shareable invite URL the sender copies and sends out themselves. */
export function inviteUrl(inviteCode: string): string {
  return `https://app.vortexfinance.co/invite/${inviteCode}`;
}

/** Generates a short, human-copyable invite token (e.g. "7K2QF9"). */
export function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

/**
 * Mocks the profile a recipient submits when they complete onboarding through the invite
 * link — the sender no longer enters these, so we synthesize a plausible name + payout value.
 */
export function mockRecipientProfile(recipient: Recipient): { name: string; bankValue: string } {
  const name =
    recipient.recipientType === "company" ? `${recipient.inviteCode} Holdings Ltd` : `Recipient ${recipient.inviteCode}`;
  const bankValue = MOCK_BANK_VALUE[recipient.bankDetails.method];
  return { bankValue, name };
}

const MOCK_BANK_VALUE: Record<Recipient["bankDetails"]["method"], string> = {
  ach: "021000021 · 000123456789",
  iban: "DE89 3704 0044 0532 0130 00",
  pix: "recipient@bank.example",
  spei: "012180001234567895"
};
