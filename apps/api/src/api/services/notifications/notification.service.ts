import logger from "../../../config/logger";
import Notification from "../../../models/notification.model";
import NotificationPreference from "../../../models/notificationPreference.model";

export interface NotificationEvent {
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  customerEntityId?: string;
}

/**
 * Writes an in-app notification for a profile. Email dispatch (plan D7 — Supabase
 * SMTP/edge function) is not wired yet: when the transport lands it hooks in here,
 * gated on the profile's `email_enabled` preference. Never throws — a failed
 * notification must not fail the business operation that triggered it.
 */
export async function emitNotification(profileId: string, event: NotificationEvent): Promise<Notification | null> {
  try {
    const notification = await Notification.create({
      body: event.body ?? null,
      customerEntityId: event.customerEntityId ?? null,
      metadata: event.metadata ?? {},
      profileId,
      title: event.title,
      type: event.type
    });
    return notification;
  } catch (error) {
    logger.error(`Failed to emit notification '${event.type}' for profile ${profileId}:`, error);
    return null;
  }
}

/** The profile's preferences row, created with defaults on first read. */
export async function getOrCreateNotificationPreferences(profileId: string): Promise<NotificationPreference> {
  const [preferences] = await NotificationPreference.findOrCreate({
    defaults: { emailEnabled: true, prefs: {}, profileId },
    where: { profileId }
  });
  return preferences;
}
