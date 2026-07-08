import type { Recipient } from "./types";

/** Human-readable identifier for a recipient in tables, selectors and toasts. */
export function recipientLabel(recipient: Recipient): string {
  return recipient.name || recipient.email || `Invited · ${recipient.inviteCode}`;
}

/** Shareable invite URL the sender copies and sends out themselves. */
export function inviteUrl(inviteToken: string): string {
  return `https://app.vortexfinance.co/invite/${inviteToken}`;
}
