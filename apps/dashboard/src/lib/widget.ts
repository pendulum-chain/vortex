import type { CorridorId } from "@/domain/types";
import { CORRIDOR_KYB_REGION } from "@/services/api/mappers";

/**
 * The Vortex widget origin. Dev default targets the local widget dev server; production
 * builds fall back to the page origin (the dashboard is served under /dashboard/ on the
 * same origin as the widget's /widget). Set VITE_WIDGET_URL wherever that doesn't hold —
 * a wrong origin here burns the invite's one-time token on an unreachable link.
 */
const WIDGET_URL: string =
  import.meta.env.VITE_WIDGET_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:5173" : window.location.origin);

/**
 * Widget onboarding entry point for a corridor — the **recipient** hand-off (plan §6.2).
 * Senders onboard in the dashboard (§6.1). Deep-linkable corridors pin the region
 * (`?kybLocked=`). The accepted invitation remains authoritative if the URL is edited.
 */
export function onboardingUrl(corridorId: CorridorId, inviteToken?: string): string {
  const region = CORRIDOR_KYB_REGION[corridorId];
  const url = new URL(`${WIDGET_URL}/widget`);
  if (region) url.searchParams.set("kybLocked", region);
  if (inviteToken) url.searchParams.set("invite", inviteToken);
  return url.toString();
}
