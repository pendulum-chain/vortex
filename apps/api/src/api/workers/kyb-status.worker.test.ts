import { afterAll, describe, expect, it } from "bun:test";
import { FindOptions, Op } from "sequelize";
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
});
