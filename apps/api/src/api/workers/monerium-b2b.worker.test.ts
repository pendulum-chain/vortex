import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { config } from "../../config/vars";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../models/moneriumFiatDeposit.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "../services/monerium-b2b/account-provisioning";
import MoneriumB2bWorker from "./monerium-b2b.worker";

describe("MoneriumB2bWorker conversion candidates", () => {
  let originalRpcUrl: string | undefined;

  beforeAll(async () => {
    originalRpcUrl = config.moneriumB2b.rpcUrl;
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.rpcUrl = originalRpcUrl;
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function accountWithMintedRow(moneriumOrderId: string) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    const { accountId } = await provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: "0x5555555555555555555555555555555555555555",
      externalSubjectId: "client-1",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      managerProfileId: manager.id,
      moneriumProfileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });
    await MoneriumFiatDeposit.create({
      accountId,
      amountRaw: "700000000000000001",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId,
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    return accountId;
  }

  // Called off the prototype: constructing the worker runs a whole keeper cycle on init.
  const candidates = (minted: string[] = []) => MoneriumB2bWorker.prototype["conversionCandidates"](minted);

  it("runs the executor for an account with a chain-indexed deposit still settling", async () => {
    const accountId = await accountWithMintedRow("order-1");
    expect(await candidates()).toEqual([accountId]);
  });

  it("does not keep an account a candidate for a refund top-up left on the clone (unattr: row)", async () => {
    const accountId = await accountWithMintedRow("unattr:topup");
    expect(await candidates()).toEqual([]);
    // The mint watcher's touched accounts still get the run in which the top-up lands.
    expect(await candidates([accountId])).toEqual([accountId]);
  });
});
