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

/**
 * Discount-carrying invites onboard the recipient as a dashboard user (their discount
 * applies to their own ramps), so the link points at the dashboard itself, not the widget.
 */
export function dashboardInviteUrl(inviteToken: string): string {
  return `${window.location.origin}/invite/${inviteToken}`;
}
