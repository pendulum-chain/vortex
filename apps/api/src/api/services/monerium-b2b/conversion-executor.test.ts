import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { FindOptions, Transaction } from "sequelize";
import { Address, encodeAbiParameters, encodeEventTopics, encodeFunctionData, Hex, TransactionReceipt } from "viem";
import sequelize from "../../../config/database";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import * as chain from "./chain";
import { parseSubsidyLadder } from "../../../config/vars";
import {
  broadcastExecutionSequence,
  chunkElapsedSeconds,
  classifyHashlessPending,
  conversionAmountsFromSwapEvent,
  expectedCalldata,
  finalizeExecution,
  isExpectedTransaction,
  maxSubsidyBpsFor,
  planAction,
  planChunk,
  pricePlannedSwap,
  projectSwap,
  recoveryBlockRanges,
  runConversionExecutor,
  settlementState
} from "./conversion-executor";
import * as referenceRate from "./reference-rate";
import { ReferenceQuote } from "./reference-rate";

const EUR = 10n ** 18n;
const USDC = 10n ** 6n;

// One deposit converts in chunks (1 deposit : N swaps); the chunk plan never leaves a
// sub-minimum dust remainder when the last two chunks can share it.
describe("planChunk", () => {
  const MIN = 25n * EUR;
  const CAP = 10_000n * EUR;

  it("converts a deposit at or below the cap in one chunk", () => {
    expect(planChunk(9_000n * EUR, MIN, CAP)).toBe(9_000n * EUR);
    expect(planChunk(CAP, MIN, CAP)).toBe(CAP);
  });

  it("caps a large deposit and leaves a swappable remainder", () => {
    expect(planChunk(25_000n * EUR, MIN, CAP)).toBe(CAP);
    expect(planChunk(10_100n * EUR, MIN, CAP)).toBe(CAP); // leftover 100 >= minimum
  });

  it("shortens the chunk so the leftover is never sub-minimum dust", () => {
    expect(planChunk(10_010n * EUR, MIN, CAP)).toBe(10_010n * EUR - MIN); // leftover exactly the minimum
  });

  it("returns null below the minimum: such a remainder waits for the refund path", () => {
    expect(planChunk(24n * EUR, MIN, CAP)).toBeNull();
    expect(planChunk(0n, MIN, CAP)).toBeNull();
  });

  it("falls back to the cap when it cannot avoid dust (minimum close to the cap)", () => {
    expect(planChunk(30n * EUR, 25n * EUR, 25n * EUR)).toBe(25n * EUR);
  });
});

// The subsidy ladder (adr-0005 amendment 2026-09-18): how much of a shortfall Vortex pays
// after a chunk has waited, from a "seconds:bps" config string.
describe("subsidy ladder", () => {
  const ladder = parseSubsidyLadder(undefined);

  it("parses the launch ladder and looks the tier up by waiting time", () => {
    expect(ladder[0]).toEqual({ afterSeconds: 0, maxSubsidyBps: 0 });
    expect(ladder.at(-1)).toEqual({ afterSeconds: 960, maxSubsidyBps: 100 });
    expect(maxSubsidyBpsFor(ladder, 0)).toBe(0);
    expect(maxSubsidyBpsFor(ladder, 359)).toBe(0);
    expect(maxSubsidyBpsFor(ladder, 360)).toBe(10);
    expect(maxSubsidyBpsFor(ladder, 700)).toBe(30);
    expect(maxSubsidyBpsFor(ladder, 5_000)).toBe(100); // holds the last step until the refund deadline
  });

  it("rejects a malformed or non-ascending ladder", () => {
    expect(() => parseSubsidyLadder("60:10")).toThrow("start at 0");
    expect(() => parseSubsidyLadder("0:0,120:20,60:30")).toThrow("ascend");
    expect(() => parseSubsidyLadder("0:0,120:20,240:10")).toThrow("ascend");
    expect(() => parseSubsidyLadder("0:x")).toThrow("<seconds>:<bps>");
    expect(parseSubsidyLadder("0:0,120:25")).toEqual([
      { afterSeconds: 0, maxSubsidyBps: 0 },
      { afterSeconds: 120, maxSubsidyBps: 25 }
    ]);
  });

  it("counts a chunk's wait from the mint or from the previous chunk's confirmation", () => {
    const now = 1_800_000_000_000;
    const deposit = { createdAt: new Date(now - 900_000), mintedAt: new Date(now - 600_000) };
    expect(chunkElapsedSeconds(deposit, null, now)).toBe(600);
    expect(chunkElapsedSeconds(deposit, new Date(now - 120_000), now)).toBe(120);
    expect(chunkElapsedSeconds({ createdAt: new Date(now - 300_000), mintedAt: null }, null, now)).toBe(300);
  });
});

function swapRow(eureInRaw: bigint, usdcNetRaw: bigint): MoneriumConversionExecution {
  return {
    eureInRaw: eureInRaw.toString(),
    kind: MoneriumConversionExecutionKind.Swap,
    status: MoneriumConversionExecutionStatus.Confirmed,
    usdcNetRaw: usdcNetRaw.toString()
  } as unknown as MoneriumConversionExecution;
}

describe("settlementState", () => {
  it("aggregates the confirmed chunks of a deposit", () => {
    const state = settlementState({ amountRaw: (100n * EUR).toString() }, [
      swapRow(60n * EUR, 65n * USDC),
      swapRow(30n * EUR, 32n * USDC)
    ]);
    expect(state).toMatchObject({ convertedEureRaw: 90n * EUR, remainingEureRaw: 10n * EUR, usdcNetRaw: 97n * USDC });
  });

  it("never reports a negative remainder", () => {
    expect(settlementState({ amountRaw: (100n * EUR).toString() }, [swapRow(101n * EUR, 1n)]).remainingEureRaw).toBe(0n);
  });
});

describe("planAction", () => {
  const base = {
    batchOpenedAtSec: 1_000n,
    convertible: true,
    minSwapAmount: 25n * EUR,
    nowMs: 1_000_000 + 3 * 60 * 60 * 1000, // three hours after the batch opened
    perSwapCap: 10_000n * EUR,
    recoveryDelaySeconds: 2 * 60 * 60,
    recoveryInFlight: false
  };
  const deposit = (id: string, status: MoneriumFiatDepositStatus, amount: bigint) =>
    ({
      amountRaw: amount.toString(),
      createdAt: new Date(base.nowMs - 10 * 60_000),
      id,
      mintedAt: new Date(base.nowMs - 7 * 60_000),
      status
    }) as MoneriumFiatDeposit;
  const withSwaps = (row: MoneriumFiatDeposit, swaps: MoneriumConversionExecution[]) => ({
    deposit: row,
    state: settlementState(row, swaps)
  });

  it("swaps the next chunk of the oldest convertible deposit", () => {
    const plan = planAction([withSwaps(deposit("a", MoneriumFiatDepositStatus.Minted, 25_000n * EUR), [])], base);
    // The first chunk's clock runs from the mint (seven minutes ago here).
    expect(plan).toMatchObject({ amountIn: 10_000n * EUR, elapsedSeconds: 420, kind: "swap" });
  });

  it("forwards a deposit once every chunk is confirmed, with the sum of the nets", () => {
    const row = deposit("a", MoneriumFiatDepositStatus.Converting, 100n * EUR);
    const plan = planAction([withSwaps(row, [swapRow(60n * EUR, 65n * USDC), swapRow(40n * EUR, 43n * USDC)])], base);
    expect(plan).toMatchObject({ kind: "forward", usdcRaw: 108n * USDC });
  });

  it("recovers a marked deposit first, once the batch is old enough, and never before", () => {
    const stuck = withSwaps(deposit("old", MoneriumFiatDepositStatus.Recovering, 1_500n * EUR), [
      swapRow(1_000n * EUR, 1_138n * USDC)
    ]);
    const young = withSwaps(deposit("young", MoneriumFiatDepositStatus.Minted, 500n * EUR), []);
    expect(planAction([stuck, young], base)).toMatchObject({
      eureRaw: 500n * EUR,
      kind: "recover",
      usdcRaw: 1_138n * USDC
    });
    // Too early for the contract: the younger deposit keeps converting meanwhile.
    expect(planAction([stuck, young], { ...base, nowMs: 1_000_000 + 60 * 60 * 1000 })).toMatchObject({
      amountIn: 500n * EUR,
      kind: "swap"
    });
    expect(planAction([stuck, young], { ...base, batchOpenedAtSec: 0n })).toMatchObject({ kind: "swap" });
  });

  it("never sends a second recover while a refund is still on the recovery wallet", () => {
    const stuck = withSwaps(deposit("old", MoneriumFiatDepositStatus.Recovering, 500n * EUR), []);
    const young = withSwaps(deposit("young", MoneriumFiatDepositStatus.Minted, 500n * EUR), []);
    expect(planAction([stuck, young], { ...base, recoveryInFlight: true })).toMatchObject({ kind: "swap" });
  });

  it("still recovers on an account that may not convert", () => {
    const stuck = withSwaps(deposit("old", MoneriumFiatDepositStatus.Recovering, 500n * EUR), []);
    const young = withSwaps(deposit("young", MoneriumFiatDepositStatus.Minted, 500n * EUR), []);
    expect(planAction([stuck, young], { ...base, convertible: false })).toMatchObject({ kind: "recover" });
    expect(planAction([young], { ...base, convertible: false })).toMatchObject({ kind: "none" });
  });

  it("does nothing for a sub-minimum remainder or an empty queue", () => {
    expect(planAction([withSwaps(deposit("a", MoneriumFiatDepositStatus.Minted, 10n * EUR), [])], base)).toMatchObject({
      kind: "none",
      reason: expect.stringContaining("below the minimum swap")
    });
    expect(planAction([], base)).toMatchObject({ kind: "none" });
  });
});

describe("conversionAmountsFromSwapEvent", () => {
  it("nets the fee out of this chunk's output", () => {
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
// (1000 EURe at 1.14: reference 1140 USDC, target 1138.575, floor 1138.29, oracle floor 1133.16).
describe("projectSwap", () => {
  const vault = { balance: 1_000n * USDC, dailyBudget: 200n * USDC, maxSubsidyPpm: 5_000, paused: false, spentToday: 0n };
  const base = {
    amountIn: 1_000n * EUR,
    floorPpm: 1_500,
    maxFeePpm: 10_000,
    maxSubsidyRaw: 1_140n * USDC, // an unbounded tier: the vault decides
    oracleDecimals: 8,
    oracleRaw: 114_000_000n,
    referenceRaw: 114_000_000n,
    slippageBps: 60,
    targetPpm: 1_250,
    vault
  };

  it("defers a shortfall above the keeper's current tier before asking the vault", () => {
    // 2.29 USDC needed; a 10 bps tier of 1140 allows 1.14.
    expect(projectSwap({ ...base, maxSubsidyRaw: 1_140_000n, quotedOut: 1_136n * USDC }).defer).toContain("current tier");
    expect(projectSwap({ ...base, maxSubsidyRaw: 0n, quotedOut: 1_136n * USDC }).defer).toContain("current tier");
    expect(projectSwap({ ...base, maxSubsidyRaw: 2_290_000n, quotedOut: 1_136n * USDC }).defer).toBeNull();
  });

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

  // Mirrors test_swap_depeggedReference_isLiftedToTheOracleFloorWhenTheTierAndVaultAllow.
  it("lifts a depegged reference's net to the oracle floor when the tier and the vault allow, else defers", () => {
    const lowReference = (114_000_000n * 9_910n) / 10_000n; // 90 bps below Chainlink
    const needed = 1_133_160_000n - 1_127n * USDC; // 6.16 USDC up to the Chainlink floor, not the reference floor
    // The launch vault cap (50 bps of the reference value, ~5.65 USDC) cannot cover it.
    expect(projectSwap({ ...base, quotedOut: 1_127n * USDC, referenceRaw: lowReference }).defer).toContain("per-swap cap");
    const roomy = { ...vault, maxSubsidyPpm: 10_000 };
    expect(projectSwap({ ...base, maxSubsidyRaw: needed - 1n, quotedOut: 1_127n * USDC, referenceRaw: lowReference, vault: roomy }).defer).toContain("current tier");
    expect(projectSwap({ ...base, quotedOut: 1_127n * USDC, referenceRaw: lowReference, vault: roomy })).toEqual({
      defer: null,
      fee: 0n,
      net: 1_133_160_000n,
      subsidy: needed
    });
  });

  // Mirrors test_swap_depeggedReference_feeGivesWayBeforeTheOracleFloor.
  it("lets the fee give way before the client drops under the oracle floor", () => {
    const lowReference = (114_000_000n * 9_900n) / 10_000n; // 100 bps below Chainlink: the band's edge
    expect(projectSwap({ ...base, quotedOut: 1_140n * USDC, referenceRaw: lowReference })).toEqual({
      defer: null,
      fee: 1_140n * USDC - 1_133_160_000n, // only what sits above the Chainlink floor, not down to 1_127_189_250
      net: 1_133_160_000n,
      subsidy: 0n
    });
  });

  it("pays the drift below ~45 bps under Chainlink from the tier instead of deferring", () => {
    // A fill exactly at the client's reference floor: above the Chainlink floor it is untouched,
    // below it the subsidy lifts the net to the Chainlink floor (amendment 2026-09-18).
    const floorFill = (referenceRaw: bigint) => (((base.amountIn * referenceRaw) / 10n ** 20n) * 998_500n) / 1_000_000n;
    const tooLow = (114_000_000n * 9_953n) / 10_000n; // 47 bps below
    const fine = (114_000_000n * 9_957n) / 10_000n; // 43 bps below
    const lifted = projectSwap({ ...base, quotedOut: floorFill(tooLow), referenceRaw: tooLow });
    expect(lifted.defer).toBeNull();
    expect(lifted.subsidy).toBeGreaterThan(0n);
    expect(lifted.net).toBe(1_133_160_000n);
    expect(projectSwap({ ...base, maxSubsidyRaw: 0n, quotedOut: floorFill(tooLow), referenceRaw: tooLow }).defer).toContain(
      "current tier"
    );
    expect(projectSwap({ ...base, quotedOut: floorFill(fine), referenceRaw: fine })).toMatchObject({
      defer: null,
      fee: 0n,
      subsidy: 0n
    });
  });
});

describe("expectedCalldata", () => {
  const swap = {
    eureInRaw: (1_000n * EUR).toString(),
    kind: MoneriumConversionExecutionKind.Swap,
    maxSubsidyRaw: "2290000",
    usdcNetRaw: null
  };

  it("rebuilds a swap's calldata from the persisted reference, route, chunk and tier cap, or nothing", () => {
    expect(expectedCalldata({ ...swap, referenceRateRaw: null, routeIndex: 0 })).toBeNull();
    expect(expectedCalldata({ ...swap, referenceRateRaw: "114000000", routeIndex: null })).toBeNull();
    expect(expectedCalldata({ ...swap, maxSubsidyRaw: null, referenceRateRaw: "114000000", routeIndex: 1 })).toBeNull();
    expect(expectedCalldata({ ...swap, referenceRateRaw: "114000000", routeIndex: 1 })).toBe(
      encodeFunctionData({ abi: chain.forwarderAbi, args: [114_000_000n, 1n, 1_000n * EUR, 2_290_000n], functionName: "swap" })
    );
  });

  it("rebuilds a forward's and a recovery's calldata from the persisted amounts", () => {
    expect(
      expectedCalldata({
        eureInRaw: (100n * EUR).toString(),
        kind: MoneriumConversionExecutionKind.Forward,
        maxSubsidyRaw: null,
        referenceRateRaw: null,
        routeIndex: null,
        usdcNetRaw: (108n * USDC).toString()
      })
    ).toBe(encodeFunctionData({ abi: chain.forwarderAbi, args: [108n * USDC], functionName: "forward" }));
    expect(
      expectedCalldata({
        eureInRaw: (40n * EUR).toString(),
        kind: MoneriumConversionExecutionKind.Recover,
        maxSubsidyRaw: null,
        referenceRateRaw: null,
        routeIndex: null,
        usdcNetRaw: (65n * USDC).toString()
      })
    ).toBe(encodeFunctionData({ abi: chain.forwarderAbi, args: [40n * EUR, 65n * USDC], functionName: "recover" }));
  });
});

describe("classifyHashlessPending", () => {
  it("fails a row whose send phase was never reached (no persisted nonce)", () => {
    expect(classifyHashlessPending({ latestNonceCount: 0, matchingTxHashes: [], nonce: null, scanComplete: true })).toEqual({
      kind: "fail",
      reason: "crashed before the transaction was sent"
    });
  });

  it("adopts the unclaimed matching hash when the nonce was consumed", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 8, matchingTxHashes: ["0xlost"], nonce: 7, scanComplete: true })
    ).toEqual({ kind: "adopt", txHash: "0xlost" });
  });

  it("fails a consumed nonce with no matching transaction (reverted or replaced)", () => {
    expect(classifyHashlessPending({ latestNonceCount: 8, matchingTxHashes: [], nonce: 7, scanComplete: true }).kind).toBe(
      "fail"
    );
  });

  it("waits while the broadcast may still be in the mempool", () => {
    expect(classifyHashlessPending({ latestNonceCount: 7, matchingTxHashes: [], nonce: 7, scanComplete: true })).toEqual({
      kind: "in-flight",
      reason: "the persisted nonce has not been consumed"
    });
  });

  it("remains pending when recovery is incomplete or ambiguous", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 8, matchingTxHashes: [], nonce: 7, scanComplete: false }).kind
    ).toBe("in-flight");
    expect(
      classifyHashlessPending({ latestNonceCount: 8, matchingTxHashes: ["0xone", "0xtwo"], nonce: 7, scanComplete: true })
        .kind
    ).toBe("in-flight");
  });
});

describe("isExpectedTransaction", () => {
  const keeper = "0x1111111111111111111111111111111111111111";
  const forwarder = "0x2222222222222222222222222222222222222222";
  const input = encodeFunctionData({
    abi: chain.forwarderAbi,
    args: [114_000_000n, 0n, 1_000n * EUR, 0n],
    functionName: "swap"
  });
  const expected = { from: keeper, input, nonce: 7, to: forwarder };

  it("requires the exact keeper, nonce, forwarder, and calldata", () => {
    expect(isExpectedTransaction(expected, keeper, forwarder, 7, input)).toBe(true);
    expect(isExpectedTransaction({ ...expected, from: forwarder }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedTransaction({ ...expected, nonce: 8 }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedTransaction({ ...expected, to: keeper }, keeper, forwarder, 7, input)).toBe(false);
    expect(isExpectedTransaction({ ...expected, input: "0x" }, keeper, forwarder, 7, input)).toBe(false);
    const otherChunk = encodeFunctionData({
      abi: chain.forwarderAbi,
      args: [114_000_000n, 0n, 999n * EUR, 0n],
      functionName: "swap"
    });
    expect(isExpectedTransaction({ ...expected, input: otherChunk }, keeper, forwarder, 7, input)).toBe(false);
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

describe("broadcastExecutionSequence", () => {
  it("never reserves or sends when the preceding poke fails", async () => {
    const actions: string[] = [];
    await expect(
      broadcastExecutionSequence({
        broadcastBlockNumber: 100,
        pendingNonce: 7,
        pokeNeeded: true,
        reserve: async () => {
          actions.push("reserve");
          return true;
        },
        send: async nonce => {
          actions.push(`send:${nonce}`);
          return "0xsend";
        },
        sendPoke: async nonce => {
          actions.push(`poke:${nonce}`);
          throw new Error("poke rejected");
        }
      })
    ).rejects.toThrow("poke rejected");
    expect(actions).toEqual(["poke:7"]);
  });

  it("durably reserves the exact nonce after poke and before broadcast", async () => {
    const actions: string[] = [];
    const hash = await broadcastExecutionSequence({
      broadcastBlockNumber: 100,
      pendingNonce: 7,
      pokeNeeded: true,
      reserve: async (nonce, blockNumber) => {
        actions.push(`reserve:${nonce}:${blockNumber}`);
        return true;
      },
      send: async nonce => {
        actions.push(`send:${nonce}`);
        return "0xsend";
      },
      sendPoke: async nonce => {
        actions.push(`poke:${nonce}`);
      }
    });

    expect(hash).toBe("0xsend");
    expect(actions).toEqual(["poke:7", "reserve:8:100", "send:8"]);
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
      kind: MoneriumConversionExecutionKind.Swap,
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

describe("pricePlannedSwap", () => {
  afterEach(() => mock.restore());

  const FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
  const FACTORY = "0x2222222222222222222222222222222222222222" as Address;
  const VAULT = "0x3333333333333333333333333333333333333333" as Address;
  const immutables: chain.ForwarderImmutables = {
    eure: "0x4444444444444444444444444444444444444444",
    factory: FACTORY,
    maxFeePpm: 10_000,
    maxReferenceDeviationBps: 100,
    oracle: "0x5555555555555555555555555555555555555555",
    oracleDecimals: 8,
    recoveryDelaySeconds: 7_200,
    recoveryWallet: "0x7777777777777777777777777777777777777777",
    router: "0x8888888888888888888888888888888888888888",
    slippageBps: 60,
    usdc: "0x6666666666666666666666666666666666666666"
  };
  const reference: ReferenceQuote = {
    price: "1.14000000",
    rateRaw: 114_000_000n,
    source: "test",
    time: new Date(0)
  };
  const vault: chain.SubsidyVaultState = {
    balance: 1_000n * USDC,
    dailyBudget: 200n * USDC,
    maxSubsidyPpm: 5_000,
    paused: false,
    spentToday: 0n
  };
  const routes = [
    { index: 0, path: "0xaa" as Hex },
    { index: 1, path: "0xbb" as Hex }
  ];

  function arrange(
    overrides: {
      chainId?: number;
      oracleAnswer?: bigint;
      quotes?: Record<string, bigint | Error>;
      reference?: ReferenceQuote | Error;
      routes?: typeof routes;
    } = {}
  ) {
    const reads: Record<string, unknown> = {
      floorPpm: 1_500,
      latestRoundData: [1n, overrides.oracleAnswer ?? 114_000_000n, 0n, 0n, 1n],
      subsidyVault: VAULT,
      targetPpm: 1_250
    };
    spyOn(chain, "getPublicClient").mockReturnValue({
      readContract: async ({ functionName }: { functionName: string }) => reads[functionName]
    } as unknown as ReturnType<typeof chain.getPublicClient>);
    spyOn(chain, "getForwarderImmutables").mockResolvedValue(immutables);
    spyOn(chain, "getChainId").mockResolvedValue(overrides.chainId ?? 1);
    spyOn(chain, "readEnabledRoutes").mockResolvedValue(overrides.routes ?? routes);
    spyOn(chain, "readSubsidyVaultState").mockResolvedValue(vault);
    const quotes = overrides.quotes ?? { "0xaa": 1_138_400_000n, "0xbb": 1_139_000_000n };
    spyOn(chain, "quoteRouteOutput").mockImplementation(async path => {
      const quote = quotes[path];
      if (quote instanceof Error) throw quote;
      return quote;
    });
    const fetched = overrides.reference ?? reference;
    const fetchSpy = spyOn(referenceRate, "fetchCoinbaseReference");
    if (fetched instanceof Error) {
      fetchSpy.mockRejectedValue(fetched);
    } else {
      fetchSpy.mockResolvedValue(fetched);
    }
  }

  const price = (maxSubsidyBps = 50) => pricePlannedSwap(FORWARDER, FACTORY, 1_000n * EUR, maxSubsidyBps);

  it("defers on a non-positive Chainlink answer", async () => {
    arrange({ oracleAnswer: 0n });
    expect(await price()).toEqual({ kind: "defer", reason: "Chainlink EUR/USD answered 0" });
  });

  it("defers when the reference cannot be fetched", async () => {
    arrange({ reference: new Error("coinbase down") });
    expect(await price()).toMatchObject({ kind: "defer", reason: expect.stringContaining("reference rate unavailable") });
  });

  it("defers on a reference outside the Chainlink band", async () => {
    arrange({ reference: { ...reference, price: "1.12000000", rateRaw: 112_000_000n } }); // 175 bps below
    expect(await price()).toMatchObject({ kind: "defer", reason: expect.stringContaining("outside the 100 bps band") });
  });

  it("defers when the factory has no enabled route", async () => {
    arrange({ routes: [] });
    expect(await price()).toEqual({ kind: "defer", reason: "the factory has no enabled swap route" });
  });

  it("uses the first enabled route unprojected off mainnet, still carrying the tier cap", async () => {
    arrange({ chainId: 11_155_111 });
    expect(await price()).toEqual({ kind: "ready", maxSubsidyRaw: 5_700_000n, projection: null, reference, routeIndex: 0 });
  });

  it("defers when no route can be quoted", async () => {
    arrange({ quotes: { "0xaa": new Error("no pool"), "0xbb": new Error("no pool") } });
    expect(await price()).toEqual({ kind: "defer", reason: "no enabled swap route could be quoted" });
  });

  it("picks the route with the highest quote and projects its settlement", async () => {
    arrange();
    expect(await price()).toEqual({
      kind: "ready",
      maxSubsidyRaw: 5_700_000n, // 50 bps of the 1140 USDC reference value
      projection: { defer: null, fee: 425_000n, net: 1_138_575_000n, subsidy: 0n },
      reference,
      routeIndex: 1
    });
  });

  it("defers with the route, quote and shortfall when the projection defers", async () => {
    arrange({ quotes: { "0xaa": 1_130n * USDC, "0xbb": new Error("no pool") } }); // needs 8.29 USDC, cap is 5.7
    expect(await price(100)).toMatchObject({
      kind: "defer",
      reason: expect.stringMatching(/per-swap cap.*\(route 0 quoted 1130000000, shortfall 72 bps, tier 100 bps\)/)
    });
    // A tier below the shortfall defers before the vault is even consulted.
    expect(await price(0)).toMatchObject({ kind: "defer", reason: expect.stringContaining("current tier 0") });
  });
});

describe("finalizeExecution", () => {
  const FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
  const KEEPER = "0x7777777777777777777777777777777777777777" as Address;
  const TX = `0x${"ab".repeat(32)}` as Hex;

  function swapLog(
    address: Address,
    args: Record<"eureIn" | "fee" | "referenceRate" | "routeIndex" | "subsidy" | "usdcOut", bigint>
  ) {
    const inputs = chain.swapExecutedEvent.inputs;
    return {
      address,
      blockNumber: 100n,
      data: encodeAbiParameters(
        inputs.filter(input => !("indexed" in input)),
        [args.routeIndex, args.eureIn, args.usdcOut, args.referenceRate, args.fee, args.subsidy]
      ),
      logIndex: 7,
      topics: encodeEventTopics({ abi: [chain.swapExecutedEvent], args: { caller: KEEPER }, eventName: "SwapExecuted" }),
      transactionHash: TX
    };
  }

  function forwardedLog(amount: bigint) {
    return {
      address: FORWARDER,
      blockNumber: 100n,
      data: encodeAbiParameters([{ type: "uint256" }], [amount]),
      logIndex: 3,
      topics: encodeEventTopics({ abi: [chain.forwardedEvent], args: { caller: KEEPER }, eventName: "Forwarded" }),
      transactionHash: TX
    };
  }

  function recoveredLog(eureAmount: bigint, usdcAmount: bigint) {
    return {
      address: FORWARDER,
      blockNumber: 100n,
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [eureAmount, usdcAmount]),
      logIndex: 4,
      topics: encodeEventTopics({ abi: [chain.recoveredEvent], args: { caller: KEEPER }, eventName: "Recovered" }),
      transactionHash: TX
    };
  }

  function receipt(status: "reverted" | "success", logs: Array<Record<string, unknown>> = []): TransactionReceipt {
    return { blockNumber: 100n, logs, status, transactionHash: TX } as unknown as TransactionReceipt;
  }

  function pendingExecution(fields: Partial<MoneriumConversionExecution> = {}) {
    const updates: Record<string, unknown>[] = [];
    const execution = {
      depositId: null,
      kind: MoneriumConversionExecutionKind.Swap,
      ...fields,
      async update(values: Record<string, unknown>) {
        updates.push(values);
      }
    } as unknown as MoneriumConversionExecution;
    return { execution, updates };
  }

  it("fails the execution on a reverted receipt, naming its kind", async () => {
    const { execution, updates } = pendingExecution({ kind: MoneriumConversionExecutionKind.Forward });
    await finalizeExecution(execution, receipt("reverted"), FORWARDER, {} as Transaction);
    expect(updates).toEqual([{ blockNumber: 100, error: "forward reverted", status: MoneriumConversionExecutionStatus.Failed }]);
  });

  it("fails a successful receipt that carries no SwapExecuted from the forwarder itself", async () => {
    const { execution, updates } = pendingExecution();
    const foreign = swapLog("0x9999999999999999999999999999999999999999", {
      eureIn: 1_000n * EUR,
      fee: 0n,
      referenceRate: 114_000_000n,
      routeIndex: 0n,
      subsidy: 0n,
      usdcOut: 1_138n * USDC
    });
    await finalizeExecution(execution, receipt("success", [foreign]), FORWARDER, {} as Transaction);
    expect(updates).toEqual([
      {
        blockNumber: 100,
        error: "receipt succeeded but no SwapExecuted event was emitted by the forwarder",
        status: MoneriumConversionExecutionStatus.Failed
      }
    ]);
  });

  it("confirms a swap from the forwarder's SwapExecuted and records the event's pricing as authoritative", async () => {
    const { execution, updates } = pendingExecution();
    const log = swapLog(FORWARDER, {
      eureIn: 1_000n * EUR,
      fee: 425_000n,
      referenceRate: 114_000_000n,
      routeIndex: 1n,
      subsidy: 0n,
      usdcOut: 1_139n * USDC
    });
    await finalizeExecution(execution, receipt("success", [log]), FORWARDER, {} as Transaction);
    expect(updates).toEqual([
      {
        blockNumber: 100,
        error: null,
        eureInRaw: (1_000n * EUR).toString(),
        feeRaw: "425000",
        referenceRateRaw: "114000000",
        routeIndex: 1,
        status: MoneriumConversionExecutionStatus.Confirmed,
        subsidyRaw: "0",
        swapLogIndex: 7,
        txHash: TX,
        usdcGrossRaw: "1139000000",
        usdcNetRaw: "1138575000"
      }
    ]);
  });

  it("confirms a forward only when the forwarded amount is the planned one", async () => {
    const planned = pendingExecution({ kind: MoneriumConversionExecutionKind.Forward, usdcNetRaw: (108n * USDC).toString() });
    await finalizeExecution(planned.execution, receipt("success", [forwardedLog(108n * USDC)]), FORWARDER, {} as Transaction);
    expect(planned.updates).toEqual([
      { blockNumber: 100, error: null, status: MoneriumConversionExecutionStatus.Confirmed, swapLogIndex: 3, txHash: TX }
    ]);

    const mismatch = pendingExecution({ kind: MoneriumConversionExecutionKind.Forward, usdcNetRaw: (108n * USDC).toString() });
    await finalizeExecution(mismatch.execution, receipt("success", [forwardedLog(107n * USDC)]), FORWARDER, {} as Transaction);
    expect(mismatch.updates[0]).toMatchObject({
      error: expect.stringContaining("forwarded 107000000 but the execution planned 108000000"),
      status: MoneriumConversionExecutionStatus.Failed
    });
  });

  it("confirms a recovery only when both recovered amounts match the plan", async () => {
    const planned = pendingExecution({
      eureInRaw: (40n * EUR).toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      usdcNetRaw: (65n * USDC).toString()
    });
    await finalizeExecution(planned.execution, receipt("success", [recoveredLog(40n * EUR, 65n * USDC)]), FORWARDER, {} as Transaction);
    expect(planned.updates).toEqual([
      { blockNumber: 100, error: null, status: MoneriumConversionExecutionStatus.Confirmed, swapLogIndex: 4, txHash: TX }
    ]);

    const mismatch = pendingExecution({
      eureInRaw: (40n * EUR).toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      usdcNetRaw: (65n * USDC).toString()
    });
    await finalizeExecution(mismatch.execution, receipt("success", [recoveredLog(40n * EUR, 60n * USDC)]), FORWARDER, {} as Transaction);
    expect(mismatch.updates[0]).toMatchObject({ status: MoneriumConversionExecutionStatus.Failed });
  });
});
