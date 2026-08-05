import { afterAll, describe, expect, it } from "bun:test";
import { FindOptions, Op } from "sequelize";
import KycCase from "../../models/kycCase.model";
import KybStatusWorker from "./kyb-status.worker";

// `poll` does not touch `this` (see the class-methods-use-this suppression on it), so it
// can be driven directly — constructing the worker would fire a real cycle via runOnInit.
const poll = (KybStatusWorker.prototype as unknown as { poll: () => Promise<void> }).poll;

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

  await poll.call({});
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
});
