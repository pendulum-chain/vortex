import { apiClient } from "./api-client";

/**
 * Stored notification type strings, exactly as the API's dispatch worker consults them
 * (apps/api `NotificationType` values). The PUT endpoint accepts arbitrary prefs keys
 * without validation, so a key that does not match these strings mutes nothing —
 * silently. Keep them in sync with the backend enum.
 */
const VERIFICATION_TYPES = ["verification_approved", "verification_rejected", "verification_expired"] as const;
const RAMP_COMPLETED_TYPE = "ramp_completed" as const;

/** The settings-page categories, each fanning out to one or more stored types. */
export type EmailNotificationCategory = "onboarding" | "transfers";

export const CATEGORY_TYPE_KEYS: Record<EmailNotificationCategory, readonly string[]> = {
  onboarding: VERIFICATION_TYPES,
  transfers: [RAMP_COMPLETED_TYPE]
};

export interface NotificationPreferencesDto {
  emailEnabled: boolean;
  prefs: Record<string, unknown>;
}

/**
 * The dispatcher mutes a type only on an explicit `false`, so a category counts as
 * enabled while none of its types is muted. A partial mute (written by something other
 * than this page) therefore shows as off; re-enabling rewrites every key of the
 * category, which heals the partial state.
 */
export function isCategoryEnabled(prefs: Record<string, unknown>, category: EmailNotificationCategory): boolean {
  return CATEGORY_TYPE_KEYS[category].every(type => prefs[type] !== false);
}

/** Returns `prefs` with every type of `category` set, preserving unrelated keys. */
export function prefsWithCategory(
  prefs: Record<string, unknown>,
  category: EmailNotificationCategory,
  enabled: boolean
): Record<string, unknown> {
  return { ...prefs, ...Object.fromEntries(CATEGORY_TYPE_KEYS[category].map(type => [type, enabled])) };
}

export const NotificationPreferencesService = {
  get(): Promise<NotificationPreferencesDto> {
    return apiClient.get<NotificationPreferencesDto>("/notifications/preferences");
  },

  updatePrefs(prefs: Record<string, unknown>): Promise<NotificationPreferencesDto> {
    return apiClient.put<NotificationPreferencesDto>("/notifications/preferences", { prefs });
  }
};
