import { BrlaApiService, KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { afterAll, describe, expect, it, mock } from "bun:test";
import { FindOptions, Op } from "sequelize";
import EmailNotification from "../../models/emailNotification.model";
import KycCase from "../../models/kycCase.model";
import KybStatusWorker from "./kyb-status.worker";

type TestableWorker = {
  job: { isActive: boolean; waitForCompletion: boolean };
  poll: () => Promise<void>;
};

const realFindAll = KycCase.findAll;

afterAll(() => {
  KycCase.findAll = realFindAll;
});

async function captureQuery(): Promise<FindOptions> {
  let captured: FindOptions = {};
  KycCase.findAll = (async (options: FindOptions) => {
    captured = options;
    return [];
  }) as typeof KycCase.findAll;

  const worker = new KybStatusWorker() as unknown as TestableWorker;
  await worker.poll();
  return captured;
}

describe("KybStatusWorker query window", () => {
  it("bounds the poll on the case's last write, not its creation", async () => {
    const where = (await captureQuery()).where as Record<string, Record<symbol, Date>>;

    // A kyc_case row is reused across attempts, so a months-old row can hold a brand new
    // attempt — exactly the one the webhook fallback exists for. Filtering on createdAt
    // dropped it.
    expect(where.createdAt).toBeUndefined();
    expect(where.updatedAt[Op.gte]).toBeInstanceOf(Date);
  });

  it("still restricts the poll to undecided Avenia KYB cases with a bound attempt", async () => {
    const where = (await captureQuery()).where as Record<string, unknown>;

    expect(where.provider).toBe("avenia");
    expect(where.type).toBe("kyb");
    expect(where.providerCaseId).toBeDefined();
    expect(where.status).toBeDefined();
  });

  it("does not start on construction and suppresses overlapping cycles", () => {
    const { job } = new KybStatusWorker() as unknown as TestableWorker;

    expect(job.isActive).toBe(false);
    expect(job.waitForCompletion).toBe(true);
  });

  // Nothing here writes the terminal status back to kyc_cases, so without the anti-join
  // a settled attempt costs one Avenia request per hour until it ages out of the window.
  it("excludes attempts whose outcome is already queued and bounds the batch", async () => {
    const options = await captureQuery();
    const anti = (options.where as Record<symbol, { val?: string }>)[Op.and];

    expect(String(anti?.val)).toContain("NOT EXISTS");
    expect(String(anti?.val)).toContain("email_notifications");
    expect(options.limit).toBe(250);
    expect(options.order).toEqual([["id", "ASC"]]);
  });

  it("filters partner-owned entities in the join so they cannot occupy batch slots", async () => {
    const options = await captureQuery();
    const include = (options.include as Array<{ where?: Record<string, unknown> }>)[0];

    expect(include.where?.profileId).toBeDefined();
  });

  // A poll does not modify a still-pending case, so without the cursor the same first
  // batch would be re-selected every hour and everything behind it starved.
  it("advances the keyset cursor when a cycle fills its cap and resets it when one does not", async () => {
    const captured: FindOptions[] = [];
    // profileId null makes each row a fast no-op in the poll loop.
    const fakeCase = (id: string) => ({ customerEntity: { profileId: null }, id, providerCaseId: `attempt-${id}` });
    KycCase.findAll = (async (options: FindOptions) => {
      captured.push(options);
      return captured.length === 1 ? Array.from({ length: 250 }, (_, i) => fakeCase(String(i).padStart(3, "0"))) : [];
    }) as unknown as typeof KycCase.findAll;

    const worker = new KybStatusWorker() as unknown as TestableWorker;
    await worker.poll();
    await worker.poll();
    await worker.poll();

    const wheres = captured.map(options => options.where as Record<string, Record<symbol, unknown>>);
    expect(wheres[0].id).toBeUndefined();
    expect(wheres[1].id[Op.gt]).toBe("249");
    // The second cycle came back under the cap, so the third starts from the top again.
    expect(wheres[2].id).toBeUndefined();
  });

  // Mirrors the authenticated route's guard: a malformed provider response must not
  // enqueue another attempt's outcome for this case's profile.
  it("discards a provider response whose attempt id does not match the case", async () => {
    const polledCase = { customerEntity: { profileId: "user-1" }, id: "case-1", providerCaseId: "attempt-1" };
    KycCase.findAll = (async () => [polledCase]) as unknown as typeof KycCase.findAll;

    const realGetInstance = BrlaApiService.getInstance;
    const realFindOne = EmailNotification.findOne;
    // First touch of any enqueue is the dedupe lookup; recording it observes whether
    // the guard let the outcome through.
    const enqueueTouched = mock(async () => ({}) as EmailNotification);
    EmailNotification.findOne = enqueueTouched as unknown as typeof EmailNotification.findOne;

    const respondWith = (id: string) =>
      mock(
        () =>
          ({
            getKybAttemptStatus: mock(async () => ({
              attempt: { id, result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED, updatedAt: "2026-08-07" }
            }))
          }) as unknown as BrlaApiService
      );

    try {
      const worker = new KybStatusWorker() as unknown as TestableWorker;

      BrlaApiService.getInstance = respondWith("attempt-OTHER");
      await worker.poll();
      expect(enqueueTouched).not.toHaveBeenCalled();

      BrlaApiService.getInstance = respondWith("attempt-1");
      await worker.poll();
      expect(enqueueTouched).toHaveBeenCalledTimes(1);
    } finally {
      BrlaApiService.getInstance = realGetInstance;
      EmailNotification.findOne = realFindOne;
    }
  });
});
