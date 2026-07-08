import type { CorridorId } from "@/domain/types";
import { CORRIDOR_KYB_REGION } from "@/services/api/mappers";

/**
 * The Vortex widget origin, where real KYC/KYB runs. Dev default targets the local widget
 * dev server; set VITE_WIDGET_URL for other environments (prod is /widget on the main site).
 */
const WIDGET_URL: string = import.meta.env.VITE_WIDGET_URL ?? "http://127.0.0.1:5173";

/**
 * The widget onboarding entry point for a corridor. Deep-linkable corridors pin the region
 * (`?kybLocked=`); the rest open the widget home so the user picks their flow there.
 */
export function onboardingUrl(corridorId: CorridorId): string {
  const region = CORRIDOR_KYB_REGION[corridorId];
  return region ? `${WIDGET_URL}/?kybLocked=${region}` : WIDGET_URL;
}
