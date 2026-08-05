import { afterAll, describe, expect, it } from "bun:test";
import { FindOptions, IncludeOptions, Op } from "sequelize";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import AlfredpayStatusWorker from "./alfredpay-status.worker";

// `poll` does not touch `this` (see the class-methods-use-this suppression on it), so it
// can be driven directly — constructing the worker would fire a real cycle via runOnInit.
const poll = (AlfredpayStatusWorker.prototype as unknown as { poll: () => Promise<void> }).poll;

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

  await poll.call({});
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

  // Partner-owned entities have no profile to email; excluding them in the query rather
  // than the loop keeps the sweep from spending provider calls on accounts it cannot mail.
  it("excludes entities with no profile to email", async () => {
    const include = (await captureQuery()).include as IncludeOptions[];

    expect(include).toHaveLength(1);
    expect(include[0].required).toBe(true);
    expect((include[0].where as Record<string, Record<symbol, unknown>>).profileId[Op.not]).toBeNull();
  });
});
