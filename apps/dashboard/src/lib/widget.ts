import type { CorridorId } from "@/domain/types";
import { CORRIDOR_KYB_REGION } from "@/services/api/mappers";

/**
 * The Vortex widget origin. Dev default targets the local widget dev server; set
 * VITE_WIDGET_URL for other environments (prod is /widget on the main site).
 */
const WIDGET_URL: string = import.meta.env.VITE_WIDGET_URL ?? "http://127.0.0.1:5173";

/**
 * Widget onboarding entry point for a corridor — the **recipient** hand-off (plan §6.2).
 * Senders onboard in the dashboard (§6.1). Deep-linkable corridors pin the region
 * (`?kybLocked=`); EU and AR have no widget KYB region, so they open the widget home.
 *
 * Not yet called from the dashboard: recipients reach this from the invite-redemption
 * surface, which lives outside this app.
 */
export function onboardingUrl(corridorId: CorridorId): string {
  const region = CORRIDOR_KYB_REGION[corridorId];
  return region ? `${WIDGET_URL}/widget?kybLocked=${region}` : `${WIDGET_URL}/widget`;
}
