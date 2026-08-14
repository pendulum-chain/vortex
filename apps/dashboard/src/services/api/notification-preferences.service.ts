import { EmailNotificationType } from "@vortexfi/shared";
import { apiClient } from "./api-client";

/** The settings-page categories, each fanning out to one or more stored types. */
export type EmailNotificationCategory = "onboarding" | "transfers";

export const CATEGORY_TYPE_KEYS: Record<EmailNotificationCategory, readonly EmailNotificationType[]> = {
  onboarding: [
    EmailNotificationType.VerificationApproved,
    EmailNotificationType.VerificationRejected,
    EmailNotificationType.VerificationExpired
  ],
  transfers: [EmailNotificationType.RampCompleted]
};

const CATEGORIES = Object.keys(CATEGORY_TYPE_KEYS) as EmailNotificationCategory[];

export interface NotificationPreferencesDto {
  emailEnabled: boolean;
  prefs: Record<string, unknown>;
}

export interface NotificationPreferencesUpdate {
  emailEnabled?: boolean;
  prefs: Record<string, unknown>;
}

/**
 * Delivery requires the master switch on AND no type of the category muted, so that is
 * what the checkbox reflects. A partial mute (written by something other than this page)
 * shows as off; re-enabling rewrites every key of the category, which heals it.
 */
export function isCategoryEnabled(preferences: NotificationPreferencesDto, category: EmailNotificationCategory): boolean {
  return preferences.emailEnabled && CATEGORY_TYPE_KEYS[category].every(type => preferences.prefs[type] !== false);
}

/** Returns `prefs` with every type of `category` set, preserving unrelated keys. */
function prefsWithCategory(
  prefs: Record<string, unknown>,
  category: EmailNotificationCategory,
  enabled: boolean
): Record<string, unknown> {
  return { ...prefs, ...Object.fromEntries(CATEGORY_TYPE_KEYS[category].map(type => [type, enabled])) };
}

/**
 * The wire update a toggle produces. Normally only `prefs` changes. Enabling a category
 * while the master switch is off additionally lifts the switch and pins every *other*
 * category to muted — its current effective state — so turning one toggle on cannot
 * silently re-enable the rest.
 */
export function preferencesUpdateFor(
  current: NotificationPreferencesDto,
  category: EmailNotificationCategory,
  enabled: boolean
): NotificationPreferencesUpdate {
  if (enabled && !current.emailEnabled) {
    let prefs = { ...current.prefs };
    for (const other of CATEGORIES) {
      if (other !== category) {
        prefs = prefsWithCategory(prefs, other, false);
      }
    }
    return { emailEnabled: true, prefs: prefsWithCategory(prefs, category, true) };
  }

  return { prefs: prefsWithCategory(current.prefs, category, enabled) };
}

export const NotificationPreferencesService = {
  get(): Promise<NotificationPreferencesDto> {
    return apiClient.get<NotificationPreferencesDto>("/notifications/preferences");
  },

  update(update: NotificationPreferencesUpdate): Promise<NotificationPreferencesDto> {
    return apiClient.put<NotificationPreferencesDto>("/notifications/preferences", update);
  }
};
