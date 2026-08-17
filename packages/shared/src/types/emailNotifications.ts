/**
 * Stored `email_notifications.type` values — the wire contract between the API's email
 * dispatch worker (which mutes a type when `notification_preferences.prefs[type]` is
 * `false`) and the dashboard's Settings toggles that write those keys. The preferences
 * endpoint accepts arbitrary keys without validation, so a drifted string mutes
 * nothing, silently; both sides must consume this enum.
 */
export enum EmailNotificationType {
  RampCompleted = "ramp_completed",
  VerificationApproved = "verification_approved",
  VerificationExpired = "verification_expired",
  VerificationRejected = "verification_rejected"
}
