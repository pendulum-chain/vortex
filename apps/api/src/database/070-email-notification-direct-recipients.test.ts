import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Transaction } from "sequelize";
import { enqueueManagedProfileInvitation } from "../api/services/email/managed-profile-membership-invitation";
import sequelize from "../config/database";
import { config } from "../config/vars";
import EmailNotification, {
  NotificationProvider,
  NotificationStatus,
  NotificationType
} from "../models/emailNotification.model";
import User from "../models/user.model";
import { setupTestDatabase } from "../test-utils/db";

describe("070 email notification recipient constraints", () => {
  let transaction: Transaction;
  let userId: string;
  const originalUrl = config.dashboardPublicUrl;

  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    transaction = await sequelize.transaction({ logging: false });
    const user = await User.create(
      { email: `${crypto.randomUUID()}@example.com`, id: crypto.randomUUID() },
      { logging: false, transaction }
    );
    userId = user.id;
    config.dashboardPublicUrl = "https://dashboard.example.com";
  });
  afterEach(async () => {
    await transaction?.rollback();
    config.dashboardPublicUrl = originalUrl;
  });

  async function insert(overrides: Record<string, unknown> = {}) {
    // Raw SQL deliberately bypasses model validation to prove the database boundary.
    return sequelize.query(
      `INSERT INTO email_notifications
        (id, provider, type, user_id, recipient_email, resource_id, locale, payload, status,
          attempts, next_attempt_at, created_at, updated_at)
       VALUES (:id, :provider, :type, :userId, :recipientEmail, :resourceId, 'en-US', '{}', 'pending', 0, NOW(), NOW(), NOW())`,
      {
        logging: false,
        replacements: {
          id: crypto.randomUUID(),
          provider: "vortex",
          recipientEmail: "invitee@example.com",
          resourceId: crypto.randomUUID(),
          type: "managed_profile_membership_invitation",
          userId: null,
          ...overrides
        },
        transaction
      }
    );
  }

  it("retains profile-addressed notifications and permits direct invitations without a profile", async () => {
    await insert({ recipientEmail: null, type: "ramp_completed", userId });
    await insert();
    expect(await EmailNotification.count({ transaction, where: { userId } })).toBe(1);
  });

  it.each([
    { recipientEmail: null },
    { recipientEmail: null, type: "ramp_completed" },
    { type: "ramp_completed" },
    { type: "verification_approved" },
    { type: "unknown_type" },
    { provider: "avenia" },
    { recipientEmail: "" },
    { recipientEmail: "INVITEE@example.com" },
    { recipientEmail: " invitee@example.com " },
    { recipientEmail: "invitee@example.com\nBcc:attacker@example.com" }
  ])("rejects an invalid recipient/type combination: %j", async overrides => {
    await expect(insert(overrides)).rejects.toMatchObject({
      original: { code: "23514", constraint: "email_notifications_recipient_source_check" }
    });
  });

  it("rejects both recipient sources", async () => {
    await expect(insert({ userId })).rejects.toMatchObject({ original: { code: "23514" } });
  });

  it("does not let invitations fall back to profile addressing", async () => {
    await expect(insert({ recipientEmail: null, userId })).rejects.toMatchObject({ original: { code: "23514" } });
  });

  it("preserves the profile foreign key", async () => {
    await expect(insert({ recipientEmail: null, type: "ramp_completed", userId: crypto.randomUUID() })).rejects.toMatchObject({
      original: { code: "23503" }
    });
  });

  it("preserves uniqueness on the invitation UUID resource key", async () => {
    const resourceId = crypto.randomUUID();
    await insert({ resourceId });
    await expect(insert({ resourceId })).rejects.toMatchObject({ original: { code: "23505" } });
  });

  it("enqueues idempotently inside the caller transaction without resetting sent rows or retargeting", async () => {
    const invitationId = crypto.randomUUID();
    await enqueueManagedProfileInvitation({ invitationId, recipientEmail: " INVITEE@example.com " }, transaction);
    const where = { resourceId: invitationId, type: NotificationType.ManagedProfileMembershipInvitation };
    const queued = await EmailNotification.findOne({ transaction, where });
    expect(queued?.userId).toBeNull();
    expect(queued?.recipientEmail).toBe("invitee@example.com");
    expect(queued?.provider).toBe(NotificationProvider.Vortex);
    expect(await EmailNotification.count({ where })).toBe(0);
    await queued!.update({ status: NotificationStatus.Sent }, { transaction });
    await enqueueManagedProfileInvitation(
      { invitationId: invitationId.toUpperCase(), recipientEmail: "different@example.com" },
      transaction
    );
    expect(await EmailNotification.count({ transaction, where })).toBe(1);
    await queued!.reload({ transaction });
    expect(queued?.status).toBe(NotificationStatus.Sent);
    expect(queued?.recipientEmail).toBe("invitee@example.com");
  });

  it("rolls back the outbox row with the invitation owner's transaction", async () => {
    const invitationId = crypto.randomUUID();
    await expect(
      sequelize.transaction(async callerTransaction => {
        await enqueueManagedProfileInvitation({ invitationId, recipientEmail: "invitee@example.com" }, callerTransaction);
        throw new Error("invitation event write failed");
      })
    ).rejects.toThrow("invitation event write failed");
    expect(await EmailNotification.count({ where: { resourceId: invitationId } })).toBe(0);
  });
});
