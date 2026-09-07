import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { Transaction } from "sequelize";
import { config } from "../../../config/vars";
import EmailNotification, { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import { SupabaseAuthService } from "../auth";
import { enqueueManagedProfileInvitation } from "./managed-profile-membership-invitation";
import { enqueueNotification } from "./notification.service";
import { renderNotification } from "./templates";
import { renderManagedProfileInvitation } from "./templates/managed-profile-membership-invitation";

const invitationId = "a48e12c3-4398-4e4b-9846-48a083ed7b41";
const recipientEmail = "invitee@example.com";
const transaction = {} as Transaction;
const originalUrl = config.dashboardPublicUrl;

afterEach(() => {
  config.dashboardPublicUrl = originalUrl;
});

describe("managed-profile invitation email", () => {
  it("queues only minimal facts using the supplied transaction, without resolving a profile", async () => {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    const write = spyOn(EmailNotification, "findOrCreate").mockResolvedValue([{} as EmailNotification, true]);
    const locale = spyOn(SupabaseAuthService, "getUserLocale");
    try {
      await enqueueManagedProfileInvitation({ invitationId, recipientEmail: "  INVITEE@example.com  " }, transaction);
      const key = {
        provider: NotificationProvider.Vortex,
        resourceId: invitationId,
        type: NotificationType.ManagedProfileMembershipInvitation
      };
      expect(write).toHaveBeenCalledWith({
        defaults: {
          ...key,
          locale: "en-US",
          payload: { invitationUrl: `https://dashboard.example.com/member-invitations/${invitationId}` },
          recipientEmail,
          userId: null
        },
        logging: false,
        transaction,
        where: key
      });
      expect(locale).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      locale.mockRestore();
    }
  });

  it("fails closed without a transaction or configured origin", async () => {
    config.dashboardPublicUrl = undefined;
    await expect(enqueueManagedProfileInvitation({ invitationId, recipientEmail }, transaction)).rejects.toThrow(
      "DASHBOARD_PUBLIC_URL is required"
    );
    await expect(
      enqueueManagedProfileInvitation({ invitationId, recipientEmail }, undefined as unknown as Transaction)
    ).rejects.toThrow("requires the invitation transaction");
  });

  it.each([
    { invitationId: "../../redirect", recipientEmail },
    { invitationId, recipientEmail: "invitee@example.com\r\nBcc: attacker@example.com" },
    { invitationId, recipientEmail: "not-an-email" }
  ])("rejects invalid input without exposing it in errors", async input => {
    await expect(enqueueManagedProfileInvitation(input, transaction)).rejects.toThrow("Invalid invitation email input");
  });

  it("sanitizes database failures while propagating failure to the transaction owner", async () => {
    config.dashboardPublicUrl = "https://dashboard.example.com";
    const write = spyOn(EmailNotification, "findOrCreate").mockRejectedValue(new Error(`${recipientEmail} ${invitationId}`));
    try {
      await expect(enqueueManagedProfileInvitation({ invitationId, recipientEmail }, transaction)).rejects.toThrow(
        "Could not enqueue managed-profile invitation email"
      );
    } finally {
      write.mockRestore();
    }
  });

  it("does not allow the generic profile producer to create invitations", async () => {
    await expect(
      enqueueNotification({
        payload: {},
        provider: NotificationProvider.Vortex,
        resourceId: invitationId,
        type: NotificationType.ManagedProfileMembershipInvitation,
        userId: "profile-id"
      })
    ).rejects.toThrow("requires its dedicated producer");
  });

  it("renders the invitation link in HTML and text with seven-day, explicit-acceptance copy", () => {
    const invitationUrl = `https://dashboard.example.com/member-invitations/${invitationId}`;
    const rendered = renderNotification(EmailNotification.build({
      locale: "en-US",
      payload: { childId: "must-not-appear", invitationUrl, role: "read_only" },
      provider: NotificationProvider.Vortex,
      recipientEmail,
      resourceId: invitationId,
      type: NotificationType.ManagedProfileMembershipInvitation,
      userId: null
    }));
    for (const body of [rendered.html, rendered.text]) {
      expect(body).toContain(invitationUrl);
      expect(body).toContain("Seven days after the invitation was created");
      expect(body).toContain("explicitly accept");
      expect(body).not.toContain("must-not-appear");
      expect(body).not.toContain("read_only");
      expect(body).not.toContain(recipientEmail);
    }
    expect(rendered.subject).not.toContain(invitationId);
  });

  it("escapes the link attribute rather than interpolating HTML", () => {
    const rendered = renderManagedProfileInvitation('https://dashboard.example.com/"<img>&');
    expect(rendered.html).toContain("&quot;&lt;img&gt;&amp;");
    expect(rendered.html).not.toContain('href="https://dashboard.example.com/"<img>');
  });
});
