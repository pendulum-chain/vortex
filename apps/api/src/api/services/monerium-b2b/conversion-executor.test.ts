import { describe, expect, it } from "bun:test";
import { FindOptions, Transaction } from "sequelize";
import { encodeFunctionData } from "viem";
import sequelize from "../../../config/database";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import {
  AllocatableDeposit,
  allocateUsdcProRata,
  broadcastSwapSequence,
  classifyHashlessPending,
  conversionAmountsFromSwapEvent,
  isExpectedSwapTransaction,
  recoveryBlockRanges,
  runConversionExecutor,
  selectDepositsForExecution
} from "./conversion-executor";
import { forwarderAbi } from "./chain";

// R04 attribution (docs/architecture-monerium-b2b-onramp.md §3): pro-rata by
// amount_raw against eureInRaw, floor division, remainder to the largest deposit.
// No chain or database involved — pure math.

const EUR = 10n ** 18n;
const USDC = 10n ** 6n;

function deposit(id: string, amountRaw: bigint): AllocatableDeposit {
  return { amountRaw, id };
}

describe("selectDepositsForExecution", () => {
  it("selects all deposits when they fit within eureInRaw", () => {
    const deposits = [deposit("a", 100n * EUR), deposit("b", 50n * EUR)];
    expect(selectDepositsForExecution(deposits, 150n * EUR)).toEqual(deposits);
  });

  it("splits a deposit at the per-swap cap cut", () => {
    const deposits = [deposit("a", 50n * EUR), deposit("b", 30n * EUR)];
    expect(selectDepositsForExecution(deposits, 60n * EUR)).toEqual([
      deposits[0],
      deposit("b", 10n * EUR)
    ]);
  });

  it("allocates only the converted portion of an oversized deposit", () => {
    expect(selectDepositsForExecution([deposit("a", 100n * EUR)], 60n * EUR)).toEqual([deposit("a", 60n * EUR)]);
  });

  it("allocates a remaining deposit portion before younger deposits", () => {
    const outstanding = deposit("big", 20n * EUR);
    const younger = deposit("small", 5n * EUR);
    expect(selectDepositsForExecution([outstanding, younger], 25n * EUR)).toEqual([outstanding, younger]);
  });

  it("handles an exact fit and an empty list", () => {
    const deposits = [deposit("a", 25n * EUR), deposit("b", 75n * EUR)];
    expect(selectDepositsForExecution(deposits, 100n * EUR)).toEqual(deposits);
    expect(selectDepositsForExecution([], 100n * EUR)).toEqual([]);
  });
});

describe("allocateUsdcProRata", () => {
  it("gives a single deposit covering the full eureIn the entire net USDC", () => {
    const shares = allocateUsdcProRata([deposit("a", 100n * EUR)], 100n * EUR, 108n * USDC);
    expect(shares.get("a")).toBe(108n * USDC);
  });

  it("splits proportionally when amounts divide evenly", () => {
    const shares = allocateUsdcProRata([deposit("a", 75n * EUR), deposit("b", 25n * EUR)], 100n * EUR, 100n * USDC);
    expect(shares.get("a")).toBe(75n * USDC);
    expect(shares.get("b")).toBe(25n * USDC);
  });

  it("floors each share and gives the division remainder to the largest deposit", () => {
    // 100 USDC over three equal thirds: floor gives 33.333333 each, 1 raw unit of dust
    // remains and goes to the largest (tie -> earliest).
    const shares = allocateUsdcProRata(
      [deposit("a", 1n * EUR), deposit("b", 1n * EUR), deposit("c", 1n * EUR)],
      3n * EUR,
      100n * USDC
    );
    expect(shares.get("a")).toBe(33333334n);
    expect(shares.get("b")).toBe(33333333n);
    expect(shares.get("c")).toBe(33333333n);
    expect([...shares.values()].reduce((sum, share) => sum + share, 0n)).toBe(100n * USDC);
  });

  it("gives the remainder to the largest deposit, not the first", () => {
    const shares = allocateUsdcProRata([deposit("small", 1n * EUR), deposit("big", 2n * EUR)], 3n * EUR, 100n * USDC);
    expect(shares.get("small")).toBe(33333333n);
    expect(shares.get("big")).toBe(66666667n);
  });

  it("handles a dust deposit whose floor share is zero", () => {
    // 1 raw-unit deposit against 100 EUR in: floor share is 0; the sum invariant holds
    // because the remainder lands on the large deposit.
    const shares = allocateUsdcProRata([deposit("dust", 1n), deposit("big", 100n * EUR - 1n)], 100n * EUR, 100n * USDC);
    expect(shares.get("dust")).toBe(0n);
    expect(shares.get("big")).toBe(100n * USDC);
  });

  it("conserves the total exactly whenever the selection covers eureInRaw", () => {
    const deposits = [deposit("a", 7n * EUR), deposit("b", 13n * EUR), deposit("c", 17n * EUR)];
    const usdcNet = 39_876_543n;
    const shares = allocateUsdcProRata(deposits, 37n * EUR, usdcNet);
    expect([...shares.values()].reduce((sum, share) => sum + share, 0n)).toBe(usdcNet);
  });

  it("returns an empty allocation for an empty selection or non-positive eureIn", () => {
    expect(allocateUsdcProRata([], 100n * EUR, 100n * USDC).size).toBe(0);
    expect(allocateUsdcProRata([deposit("a", 1n * EUR)], 0n, 100n * USDC).size).toBe(0);
  });

  it("clamps an oversized sole deposit to the swapped amount and conserves the total", () => {
    const shares = allocateUsdcProRata([deposit("big", 100n * EUR)], 100n * EUR, 108n * USDC);
    expect(shares.get("big")).toBe(108n * USDC);
  });

  it("does not assign output for an unindexed portion of an execution", () => {
    const shares = allocateUsdcProRata([deposit("known", 60n * EUR)], 100n * EUR, 100n * USDC);
    expect(shares.get("known")).toBe(60n * USDC);
  });
});

describe("conversionAmountsFromSwapEvent", () => {
  it("excludes unsolicited USDC swept alongside this swap", () => {
    expect(
      conversionAmountsFromSwapEvent({ fee: 8n * USDC, forwarded: 208n * USDC, usdcOut: 108n * USDC })
    ).toEqual({ feeRaw: "8000000", usdcGrossRaw: "108000000", usdcNetRaw: "100000000" });
  });

  it("refuses an impossible event whose fee exceeds this swap's output", () => {
    expect(() => conversionAmountsFromSwapEvent({ fee: 2n, forwarded: 0n, usdcOut: 1n })).toThrow("fee exceeds");
  });
});

describe("classifyHashlessPending", () => {
  it("fails a row whose send phase was never reached (no persisted nonce)", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 0, matchingSwapTxHashes: [], nonce: null, scanComplete: true })
    ).toEqual({ kind: "fail", reason: "crashed before the transaction was sent" });
  });

  it("adopts the unclaimed SwapExecuted hash when the nonce was consumed", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 8, matchingSwapTxHashes: ["0xlost"], nonce: 7, scanComplete: true })
    ).toEqual({ kind: "adopt", txHash: "0xlost" });
  });

  it("fails a consumed nonce with no SwapExecuted (reverted or replaced)", () => {
    const result = classifyHashlessPending({
      latestNonceCount: 8,
      matchingSwapTxHashes: [],
      nonce: 7,
      scanComplete: true
    });
    expect(result.kind).toBe("fail");
  });

  it("waits while the broadcast may still be in the mempool", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 7, matchingSwapTxHashes: [], nonce: 7, scanComplete: true })
    ).toEqual({ kind: "in-flight", reason: "the persisted nonce has not been consumed" });
  });

  it("remains fail-closed when a persisted nonce is not visible in the mempool", () => {
    const result = classifyHashlessPending({
      latestNonceCount: 7,
      matchingSwapTxHashes: [],
      nonce: 7,
      scanComplete: true
    });
    expect(result.kind).toBe("in-flight");
  });

  it("remains pending when recovery is incomplete or ambiguous", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 8, matchingSwapTxHashes: [], nonce: 7, scanComplete: false }).kind
    ).toBe("in-flight");
    expect(
      classifyHashlessPending({
        latestNonceCount: 8,
        matchingSwapTxHashes: ["0xone", "0xtwo"],
        nonce: 7,
        scanComplete: true
      }).kind
    ).toBe("in-flight");
  });
});

describe("isExpectedSwapTransaction", () => {
  const keeper = "0x1111111111111111111111111111111111111111";
  const forwarder = "0x2222222222222222222222222222222222222222";
  const expected = {
    from: keeper,
    input: encodeFunctionData({ abi: forwarderAbi, functionName: "swapAndForward" }),
    nonce: 7,
    to: forwarder
  };

  it("requires the exact keeper, nonce, forwarder, and no-arg calldata", () => {
    expect(isExpectedSwapTransaction(expected, keeper, forwarder, 7)).toBe(true);
    expect(isExpectedSwapTransaction({ ...expected, from: forwarder }, keeper, forwarder, 7)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, nonce: 8 }, keeper, forwarder, 7)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, to: keeper }, keeper, forwarder, 7)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, input: "0x" }, keeper, forwarder, 7)).toBe(false);
  });
});

describe("recoveryBlockRanges", () => {
  it("covers long recovery intervals with bounded inclusive pages", () => {
    expect(recoveryBlockRanges(1n, 4500n)).toEqual([
      { fromBlock: 1n, toBlock: 2000n },
      { fromBlock: 2001n, toBlock: 4000n },
      { fromBlock: 4001n, toBlock: 4500n }
    ]);
    expect(recoveryBlockRanges(10n, 9n)).toEqual([]);
  });
});

describe("broadcastSwapSequence", () => {
  it("never reserves or sends a swap when the preceding poke fails", async () => {
    const actions: string[] = [];
    await expect(
      broadcastSwapSequence({
        broadcastBlockNumber: 100,
        pendingNonce: 7,
        pokeNeeded: true,
        reserveSwap: async () => {
          actions.push("reserve");
          return true;
        },
        sendPoke: async nonce => {
          actions.push(`poke:${nonce}`);
          throw new Error("poke rejected");
        },
        sendSwap: async nonce => {
          actions.push(`swap:${nonce}`);
          return "0xswap";
        }
      })
    ).rejects.toThrow("poke rejected");
    expect(actions).toEqual(["poke:7"]);
  });

  it("durably reserves the exact swap nonce after poke and before broadcast", async () => {
    const actions: string[] = [];
    const hash = await broadcastSwapSequence({
      broadcastBlockNumber: 100,
      pendingNonce: 7,
      pokeNeeded: true,
      reserveSwap: async (nonce, blockNumber) => {
        actions.push(`reserve:${nonce}:${blockNumber}`);
        return true;
      },
      sendPoke: async nonce => {
        actions.push(`poke:${nonce}`);
      },
      sendSwap: async nonce => {
        actions.push(`swap:${nonce}`);
        return "0xswap";
      }
    });

    expect(hash).toBe("0xswap");
    expect(actions).toEqual(["poke:7", "reserve:8:100", "swap:8"]);
  });
});

describe("runConversionExecutor recovery ordering", () => {
  it("does not expire another executor's fresh pre-send reservation", async () => {
    const originalTransaction = sequelize.transaction;
    const originalQuery = sequelize.query;
    const originalFindAccount = MoneriumAccount.findByPk;
    const originalFindExecution = MoneriumConversionExecution.findOne;
    const originalFindExecutions = MoneriumConversionExecution.findAll;

    const account = {
      dormantSince: null,
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      id: "account-1",
      status: MoneriumAccountStatus.Closed
    } as MoneriumAccount;
    const pending = {
      accountId: account.id,
      createdAt: new Date(),
      id: "execution-1",
      nonce: null,
      status: MoneriumConversionExecutionStatus.Pending,
      txHash: null,
      updatedAt: new Date(),
      async update(values: Partial<MoneriumConversionExecution>) {
        Object.assign(this, values, { updatedAt: new Date() });
      }
    } as unknown as MoneriumConversionExecution;

    try {
      sequelize.transaction = (async (...args: unknown[]) => {
        const callback = args.at(-1) as (transaction: Transaction) => Promise<unknown>;
        return callback({} as Transaction);
      }) as typeof sequelize.transaction;
      sequelize.query = (async () => [[], 0]) as unknown as typeof sequelize.query;
      MoneriumAccount.findByPk = (async () => account) as typeof MoneriumAccount.findByPk;
      MoneriumConversionExecution.findOne = (async (options?: FindOptions) => {
        const status = (options?.where as { status?: MoneriumConversionExecutionStatus } | undefined)?.status;
        return status === MoneriumConversionExecutionStatus.Pending ? pending : null;
      }) as typeof MoneriumConversionExecution.findOne;
      MoneriumConversionExecution.findAll = (async (options?: FindOptions) => {
        const status = (options?.where as { status?: MoneriumConversionExecutionStatus } | undefined)?.status;
        return status === MoneriumConversionExecutionStatus.Pending || status === MoneriumConversionExecutionStatus.Failed
          ? [pending]
          : [];
      }) as typeof MoneriumConversionExecution.findAll;

      await runConversionExecutor(account.id);

      expect(pending.status).toBe(MoneriumConversionExecutionStatus.Pending);
      expect(pending.nonce).toBeNull();
    } finally {
      sequelize.transaction = originalTransaction;
      sequelize.query = originalQuery;
      MoneriumAccount.findByPk = originalFindAccount;
      MoneriumConversionExecution.findOne = originalFindExecution;
      MoneriumConversionExecution.findAll = originalFindExecutions;
    }
  });
});
