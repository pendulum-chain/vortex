import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumChainCursor from "../../../models/moneriumChainCursor.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumDepositAllocation from "../../../models/moneriumDepositAllocation.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { reconcileConfirmedExecutionAllocations } from "./conversion-executor";

describe("confirmed Monerium conversion allocation", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("waits for the mint cursor and uses the swap log as the exact snapshot boundary", async () => {
    const account = await MoneriumAccount.create({
      destination: "0x2222222222222222222222222222222222222222",
      fallbackAddress: "0x3333333333333333333333333333333333333333",
      feeBps: 0,
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      profileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });
    const execution = await MoneriumConversionExecution.create({
      accountId: account.id,
      blockNumber: 100,
      destination: account.destination,
      eureInRaw: "60000000000000000000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: 10,
      txHash: "0xswap",
      usdcNetRaw: "64800000"
    });
    const included = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw: "60000000000000000000",
      blockNumber: 100,
      chainId: 1,
      currency: "eur",
      logIndex: 9,
      moneriumOrderId: "included-order",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint-before"
    });
    await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw: "10000000000000000000",
      blockNumber: 100,
      chainId: 1,
      currency: "eur",
      logIndex: 11,
      moneriumOrderId: "later-order",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint-after"
    });
    const cursor = await MoneriumChainCursor.create({ lastBlock: "99", name: "eure-mints:1" });
    const deps = { getChainId: async () => 1 };

    expect(await reconcileConfirmedExecutionAllocations(deps)).toBe(0);
    expect(await MoneriumDepositAllocation.count()).toBe(0);

    await cursor.update({ lastBlock: "100" });
    expect(await reconcileConfirmedExecutionAllocations(deps)).toBe(1);
    expect(await reconcileConfirmedExecutionAllocations(deps)).toBe(0);

    const allocations = await MoneriumDepositAllocation.findAll();
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({
      depositId: included.id,
      eureInRaw: execution.eureInRaw,
      executionId: execution.id,
      usdcNetRaw: execution.usdcNetRaw
    });
  });
});
