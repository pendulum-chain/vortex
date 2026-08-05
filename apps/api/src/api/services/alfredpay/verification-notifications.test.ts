import { AlfredpayKycStatus } from "@vortexfi/shared";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import EmailNotification, { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import { SupabaseAuthService } from "../auth";
import { enqueueAlfredpayVerificationNotification } from "./verification-notifications";

const realFindOrCreate = EmailNotification.findOrCreate;
const realGetUserLocale = SupabaseAuthService.getUserLocale;

afterAll(() => {
  EmailNotification.findOrCreate = realFindOrCreate;
  SupabaseAuthService.getUserLocale = realGetUserLocale;
});

let queued: Record<string, unknown>[] = [];

beforeEach(() => {
  queued = [];
  SupabaseAuthService.getUserLocale = (async () => "en-US") as typeof SupabaseAuthService.getUserLocale;
  EmailNotification.findOrCreate = (async ({ defaults }: { defaults: Record<string, unknown> }) => {
    queued.push(defaults);
    return [defaults, true];
  }) as unknown as typeof EmailNotification.findOrCreate;
});

function enqueue(status: AlfredpayKycStatus, overrides: Record<string, unknown> = {}) {
  return enqueueAlfredpayVerificationNotification({
    status,
    subject: "individual",
    submissionId: "submission-1",
    updatedAt: "2026-08-05T10:00:00.000Z",
    userId: "user-1",
    ...overrides
  } as Parameters<typeof enqueueAlfredpayVerificationNotification>[0]);
}

describe("enqueueAlfredpayVerificationNotification", () => {
  it("queues an approval for a completed submission", async () => {
    expect(await enqueue(AlfredpayKycStatus.COMPLETED)).toBe(true);

    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe(NotificationType.VerificationApproved);
    expect(queued[0].provider).toBe(NotificationProvider.Alfredpay);
  });

  it("queues a rejection carrying the provider's failure reason", async () => {
    expect(await enqueue(AlfredpayKycStatus.FAILED, { reason: "Document unreadable" })).toBe(true);

    expect(queued[0].type).toBe(NotificationType.VerificationRejected);
    expect((queued[0].payload as { reason: string }).reason).toBe("Document unreadable");
  });

  // The reason row is the one place vendor copy reaches the reader, so it is only ever
  // rendered on a rejection — an approval must not leak a stale failure string.
  it("drops the reason on anything but a rejection", async () => {
    await enqueue(AlfredpayKycStatus.COMPLETED, { reason: "Document unreadable" });

    expect((queued[0].payload as { reason: string | null }).reason).toBeNull();
  });

  it("caps the reason so vendor copy cannot run away with the template", async () => {
    await enqueue(AlfredpayKycStatus.FAILED, { reason: "x".repeat(500) });

    expect((queued[0].payload as { reason: string }).reason).toHaveLength(200);
  });

  // Alfredpay reports the same vocabulary for KYC and KYB, so the noun in the copy can
  // only come from our own customer record.
  it("carries the subject through so KYB copy does not read as identity verification", async () => {
    await enqueue(AlfredpayKycStatus.COMPLETED, { subject: "business" });

    expect((queued[0].payload as { subject: string }).subject).toBe("business");
  });

  // The unique key is (provider, type, resource_id): keying on the submission id is what
  // makes a sweep racing or repeating a dashboard refresh a no-op.
  it("keys the row on the Alfredpay submission id", async () => {
    await enqueue(AlfredpayKycStatus.COMPLETED, { submissionId: "submission-xyz" });

    expect(queued[0].resourceId).toBe("submission-xyz");
  });

  // Alfredpay has no expiry state, and these are all still resolvable in the wizard —
  // mailing any of them would tell the user a decision was reached when none was.
  it("stays silent for every non-terminal status", async () => {
    for (const status of [
      AlfredpayKycStatus.CREATED,
      AlfredpayKycStatus.PENDING,
      AlfredpayKycStatus.IN_REVIEW,
      AlfredpayKycStatus.UPDATE_REQUIRED
    ]) {
      expect(await enqueue(status)).toBe(false);
    }

    expect(queued).toHaveLength(0);
  });
});
