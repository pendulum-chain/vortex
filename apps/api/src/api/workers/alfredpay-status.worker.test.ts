import { afterAll, describe, expect, it } from "bun:test";
import { FindOptions, IncludeOptions, Op } from "sequelize";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import AlfredpayStatusWorker from "./alfredpay-status.worker";

type TestableWorker = {
  cursorId: string | null;
  job: { isActive: boolean; waitForCompletion: boolean };
  poll: () => Promise<void>;
};

const realFindAll = ProviderCustomer.findAll;

afterAll(() => {
  ProviderCustomer.findAll = realFindAll;
});

async function captureQuery(): Promise<FindOptions> {
  let captured: FindOptions = {};
  ProviderCustomer.findAll = (async (options: FindOptions) => {
    captured = options;
    return [];
  }) as typeof ProviderCustomer.findAll;

  const worker = new AlfredpayStatusWorker() as unknown as TestableWorker;
  await worker.poll();
  return captured;
}

describe("AlfredpayStatusWorker query window", () => {
  it("polls only undecided Alfredpay accounts", async () => {
    const where = (await captureQuery()).where as Record<string, unknown>;

    expect(where.provider).toBe("alfredpay");
    // An account already stored terminal has had its email queued by whichever poll got
    // there first; re-polling it would spend provider calls to learn nothing.
    expect((where.status as Record<symbol, VerificationStatus[]>)[Op.notIn]).toEqual([
      VerificationStatus.Approved,
      VerificationStatus.Rejected
    ]);
  });

  // An account abandoned mid-wizard never reaches a terminal status, so without this bound
  // the sweep would re-poll every one of them for the life of the deployment.
  it("bounds the sweep on the account's last write", async () => {
    const where = (await captureQuery()).where as Record<string, Record<symbol, Date>>;

    expect(where.updatedAt[Op.gte]).toBeInstanceOf(Date);
  });

  // Each account costs two to three Alfredpay calls, so an unbounded result set would turn
  // one cycle into a provider flood.
  it("caps how many accounts a single cycle polls", async () => {
    expect((await captureQuery()).limit).toBeGreaterThan(0);
  });

  it("does not start on construction and suppresses overlapping cycles", () => {
    const { job } = new AlfredpayStatusWorker() as unknown as TestableWorker;

    expect(job.isActive).toBe(false);
    expect(job.waitForCompletion).toBe(true);
  });

  it("orders by a stable key so capped cycles can advance instead of starving older rows", async () => {
    const options = await captureQuery();

    expect(options.order).toEqual([["id", "ASC"]]);
  });

  it("continues after the previous full page, then wraps after reaching the end", async () => {
    const queries: FindOptions[] = [];
    let queryNumber = 0;
    ProviderCustomer.findAll = (async (options: FindOptions) => {
      queries.push(options);
      queryNumber += 1;
      if (queryNumber === 1) {
        return Array.from({ length: options.limit as number }, (_, index) => ({ id: `account-${index}` }));
      }
      return [];
    }) as typeof ProviderCustomer.findAll;

    const worker = new AlfredpayStatusWorker("15 * * * *", async () => undefined) as unknown as TestableWorker;
    await worker.poll();
    await worker.poll();

    const secondWhere = queries[1].where as Record<string, Record<symbol, string>>;
    expect(secondWhere.id[Op.gt]).toBe("account-249");
    expect(worker.cursorId).toBeNull();
  });

  // Partner-owned entities have no profile to email; excluding them in the query rather
  // than the loop keeps the sweep from spending provider calls on accounts it cannot mail.
  it("excludes entities with no profile to email", async () => {
    const include = (await captureQuery()).include as IncludeOptions[];

    expect(include).toHaveLength(1);
    expect(include[0].required).toBe(true);
    expect((include[0].where as Record<string, Record<symbol, unknown>>).profileId[Op.not]).toBeNull();
  });
});
