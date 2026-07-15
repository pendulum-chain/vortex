import type { CorridorId } from "@/domain/types";
import { CORRIDOR_KYB_REGION } from "@/services/api/mappers";

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
