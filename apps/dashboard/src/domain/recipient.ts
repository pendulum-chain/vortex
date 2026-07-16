import { onboardingUrl } from "@/lib/widget";
import type { CorridorId, Recipient } from "./types";

/** Human-readable identifier for a recipient in tables, selectors and toasts. */
export function recipientLabel(recipient: Recipient): string {
  // Never fall back to inviteCode — it now carries the raw invite token.
  return recipient.name || recipient.email || "Invited recipient";
}

/** Shareable invite URL the sender copies and sends out themselves. */
export function inviteUrl(inviteToken: string, corridorId: CorridorId): string {
  return onboardingUrl(corridorId, inviteToken);
}
