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
  expectedSwapCalldata,
  isExpectedSwapTransaction,
  projectSwap,
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
  it("nets the fee out of this swap's output regardless of what was forwarded", () => {
    expect(conversionAmountsFromSwapEvent({ fee: 8n * USDC, subsidy: 0n, usdcOut: 108n * USDC })).toEqual({
      feeRaw: "8000000",
      subsidyRaw: "0",
      usdcGrossRaw: "108000000",
      usdcNetRaw: "100000000"
    });
  });

  it("adds the vault subsidy to the client's net", () => {
    expect(conversionAmountsFromSwapEvent({ fee: 0n, subsidy: 2n * USDC, usdcOut: 106n * USDC })).toEqual({
      feeRaw: "0",
      subsidyRaw: "2000000",
      usdcGrossRaw: "106000000",
      usdcNetRaw: "108000000"
    });
  });

  it("refuses an impossible event whose fee exceeds this swap's output", () => {
    expect(() => conversionAmountsFromSwapEvent({ fee: 2n, subsidy: 0n, usdcOut: 1n })).toThrow("fee exceeds");
  });
});

// Off-chain mirror of the contract's settlement: same numbers as the Foundry suite
// (1000 EURe at 1.14: reference 1140 USDC, target 1138.575, floor 1138.29, oracle floor 1135.44).
describe("projectSwap", () => {
  const vault = { balance: 1_000n * USDC, dailyBudget: 200n * USDC, maxSubsidyPpm: 5_000, paused: false, spentToday: 0n };
  const base = {
    amountIn: 1_000n * EUR,
    floorPpm: 1_500,
    maxFeePpm: 10_000,
    oracleDecimals: 8,
    oracleRaw: 114_000_000n,
    referenceRaw: 114_000_000n,
    slippageBps: 40,
    targetPpm: 1_250,
    vault
  };

  it("takes the surplus above the target as fee, capped at MAX_FEE_PPM", () => {
    expect(projectSwap({ ...base, quotedOut: 1_145n * USDC })).toEqual({
      defer: null,
      fee: 1_145n * USDC - 1_138_575_000n,
      net: 1_138_575_000n,
      subsidy: 0n
    });
    expect(projectSwap({ ...base, quotedOut: 1_200n * USDC }).fee).toBe(12n * USDC);
  });

  it("leaves a fill between the floor and the target untouched", () => {
    expect(projectSwap({ ...base, quotedOut: 1_138_400_000n })).toEqual({
      defer: null,
      fee: 0n,
      net: 1_138_400_000n,
      subsidy: 0n
    });
  });

  it("tops a fill below the floor up from the vault", () => {
    expect(projectSwap({ ...base, quotedOut: 1_136n * USDC })).toEqual({
      defer: null,
      fee: 0n,
      net: 1_138_290_000n,
      subsidy: 2_290_000n
    });
  });

  it("defers when the vault cannot cover the subsidy", () => {
    expect(projectSwap({ ...base, quotedOut: 1_130n * USDC }).defer).toContain("per-swap cap");
    expect(projectSwap({ ...base, quotedOut: 1_136n * USDC, vault: null }).defer).toContain("no subsidy vault");
    expect(projectSwap({ ...base, quotedOut: 1_136n * USDC, vault: { ...vault, paused: true } }).defer).toContain("paused");
    expect(
      projectSwap({ ...base, quotedOut: 1_136n * USDC, vault: { ...vault, spentToday: 199n * USDC } }).defer
    ).toContain("daily budget");
    expect(projectSwap({ ...base, quotedOut: 1_136n * USDC, vault: { ...vault, balance: 1n * USDC } }).defer).toContain(
      "vault balance"
    );
  });

  it("defers when even the subsidized net sits below the oracle floor (depegged reference)", () => {
    const projection = projectSwap({ ...base, quotedOut: 1_127n * USDC, referenceRaw: (114_000_000n * 9_910n) / 10_000n });
    expect(projection.subsidy).toBeGreaterThan(0n);
    expect(projection.defer).toContain("oracle floor");
  });
});

describe("expectedSwapCalldata", () => {
  it("rebuilds the exact calldata from the persisted reference and route, or nothing", () => {
    expect(expectedSwapCalldata({ referenceRateRaw: null, routeIndex: 0 })).toBeNull();
    expect(expectedSwapCalldata({ referenceRateRaw: "114000000", routeIndex: null })).toBeNull();
    expect(expectedSwapCalldata({ referenceRateRaw: "114000000", routeIndex: 1 })).toBe(
      encodeFunctionData({ abi: forwarderAbi, args: [114_000_000n, 1n], functionName: "swapAndForward" })
    );
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
  const input = encodeFunctionData({ abi: forwarderAbi, args: [114_000_000n, 0n], functionName: "swapAndForward" });
  const expected = { from: keeper, input, nonce: 7, to: forwarder };

  it("requires the exact keeper, nonce, forwarder, and priced calldata", () => {
    expect(isExpectedSwapTransaction(expected, keeper, forwarder, 7, input)).toBe(true);
    expect(isExpectedSwapTransaction({ ...expected, from: forwarder }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, nonce: 8 }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, to: keeper }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedSwapTransaction({ ...expected, input: "0x" }, keeper, forwarder, 7, input)).toBe(false);
    const otherReference = encodeFunctionData({
      abi: forwarderAbi,
      args: [114_100_000n, 0n],
      functionName: "swapAndForward"
    });
    expect(isExpectedSwapTransaction({ ...expected, input: otherReference }, keeper, forwarder, 7, input)).toBe(false);
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
