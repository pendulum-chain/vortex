import { KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import EmailNotification, { NotificationProvider, NotificationType } from "../../../models/emailNotification.model";
import { SupabaseAuthService } from "../auth";
import { enqueueVerificationNotification, NotifiableAttempt } from "./verification-notifications";

const realFindOrCreate = EmailNotification.findOrCreate;
const realFindOne = EmailNotification.findOne;
const realGetUserLocale = SupabaseAuthService.getUserLocale;

afterAll(() => {
  EmailNotification.findOrCreate = realFindOrCreate;
  EmailNotification.findOne = realFindOne;
  SupabaseAuthService.getUserLocale = realGetUserLocale;
});

let queued: Record<string, unknown>[] = [];
let keys: Record<string, unknown>[] = [];

beforeEach(() => {
  queued = [];
  keys = [];
  SupabaseAuthService.getUserLocale = (async () => "en-US") as typeof SupabaseAuthService.getUserLocale;
  EmailNotification.findOne = (async () => null) as unknown as typeof EmailNotification.findOne;
  EmailNotification.findOrCreate = (async ({ defaults, where }: { defaults: Record<string, unknown>; where: Record<string, unknown> }) => {
    queued.push(defaults);
    keys.push(where);
    return [defaults, true];
  }) as unknown as typeof EmailNotification.findOrCreate;
});

function attempt(overrides: Partial<NotifiableAttempt> = {}): NotifiableAttempt {
  return {
    id: "attempt-1",
    status: KycAttemptStatus.COMPLETED,
    updatedAt: "2026-08-05T10:00:00.000Z",
    ...overrides
  };
}

describe("enqueueVerificationNotification", () => {
  it("queues an approval keyed on the Avenia attempt id", async () => {
    const enqueued = await enqueueVerificationNotification(attempt({ result: KycAttemptResult.APPROVED }), "user-1", "business");

    expect(enqueued).toBe(true);
    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe(NotificationType.VerificationApproved);
    expect((queued[0].payload as { subject: string }).subject).toBe("business");
    // The attempt id is the dedupe key that makes a replayed webhook or a racing poll a no-op.
    expect(keys[0]).toEqual({
      provider: NotificationProvider.Avenia,
      resourceId: "attempt-1",
      type: NotificationType.VerificationApproved
    });
  });

  it("queues a rejection carrying the provider's reason, capped at 200 characters", async () => {
    const enqueued = await enqueueVerificationNotification(
      attempt({ result: KycAttemptResult.REJECTED, resultMessage: "y".repeat(500) }),
      "user-1",
      "individual"
    );

    expect(enqueued).toBe(true);
    expect(queued[0].type).toBe(NotificationType.VerificationRejected);
    expect((queued[0].payload as { reason: string }).reason).toBe("y".repeat(200));
  });

  it("omits the reason on non-rejections", async () => {
    await enqueueVerificationNotification(
      attempt({ result: KycAttemptResult.APPROVED, resultMessage: "internal note" }),
      "user-1",
      "individual"
    );

    expect((queued[0].payload as { reason: string | null }).reason).toBeNull();
  });

  it("queues an expiry regardless of result", async () => {
    const enqueued = await enqueueVerificationNotification(attempt({ status: KycAttemptStatus.EXPIRED }), "user-1", "individual");

    expect(enqueued).toBe(true);
    expect(queued[0].type).toBe(NotificationType.VerificationExpired);
  });

  it("ignores non-terminal and unrecognised outcomes", async () => {
    expect(await enqueueVerificationNotification(attempt({ status: KycAttemptStatus.PENDING }), "user-1", "individual")).toBe(
      false
    );
    expect(await enqueueVerificationNotification(attempt(), "user-1", "individual")).toBe(false);
    expect(
      await enqueueVerificationNotification(attempt({ result: "SOMETHING_NEW" as KycAttemptResult }), "user-1", "individual")
    ).toBe(false);

    expect(queued).toHaveLength(0);
  });
});
