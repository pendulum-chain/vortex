import type { CorridorId } from "@/domain/types";

/**
 * The Vortex widget origin. The dashboard is hosted on its own domain, so the widget is
 * never same-origin: dev falls back to the local widget dev server, production builds to
 * the production widget site. Set VITE_WIDGET_URL for every other environment (staging!) —
 * a wrong origin here burns the invite's one-time token on an unreachable link.
 */
const WIDGET_URL: string =
  import.meta.env.VITE_WIDGET_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:5173" : "https://app.vortexfinance.co");

/**
 * Widget onboarding entry point for a corridor — the **recipient** hand-off (plan §6.2).
 * Senders onboard in the dashboard (§6.1). The corridor id doubles as the widget's KYB region
 * code (`?kybLocked=`, see `KYB_REGIONS` in `apps/frontend/src/constants/kybRegions.ts`). That
 * list excludes EU (EU recipients onboard via Monerium), so an EU link's `?kybLocked=EU` is not
 * recognized and the corridor locks from the accepted invitation response instead, which stays
 * authoritative if the URL is edited.
 */
export function onboardingUrl(corridorId: CorridorId, inviteToken?: string): string {
  const url = new URL(`${WIDGET_URL}/widget`);
  url.searchParams.set("kybLocked", corridorId);
  if (inviteToken) url.searchParams.set("invite", inviteToken);
  return url.toString();
}
