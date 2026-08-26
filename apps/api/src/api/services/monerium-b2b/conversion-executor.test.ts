import { describe, expect, it } from "bun:test";
import { AllocatableDeposit, allocateUsdcProRata, classifyHashlessPending, selectDepositsForExecution } from "./conversion-executor";

// R04 attribution (docs/prd/monerium-b2b-implementation-plan.md §3): pro-rata by
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

  it("stops before a deposit that would exceed the per-swap cap cut", () => {
    const deposits = [deposit("a", 50n * EUR), deposit("b", 30n * EUR)];
    // eureIn = 60: the 30-EUR deposit would push cumulative to 80 — it waits for the
    // next execution instead of being over-attributed to this one.
    expect(selectDepositsForExecution(deposits, 60n * EUR)).toEqual([deposits[0]]);
  });

  it("selects an oversized oldest deposit so it can never wedge attribution", () => {
    // A deposit larger than perSwapCap can never fit any execution (eureIn only
    // shrinks as the balance drains); it must attach to the execution that starts
    // converting it instead of blocking itself and every deposit behind it forever.
    expect(selectDepositsForExecution([deposit("a", 100n * EUR)], 60n * EUR)).toEqual([deposit("a", 100n * EUR)]);
  });

  it("does not head-of-line block younger deposits behind an oversized one", () => {
    const oversized = deposit("big", 120n * EUR);
    const younger = deposit("small", 5n * EUR);
    // Execution 1 (eureIn = cap): only the oversized deposit attaches.
    expect(selectDepositsForExecution([oversized, younger], 100n * EUR)).toEqual([oversized]);
    // Execution 2 (remaining balance): the younger deposit gets its own allocation.
    expect(selectDepositsForExecution([younger], 25n * EUR)).toEqual([younger]);
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
    // 120 EUR deposit, execution swapped only 100 EUR (perSwapCap): the deposit's
    // share is the full execution output, never an overshoot of it.
    const shares = allocateUsdcProRata([deposit("big", 120n * EUR)], 100n * EUR, 108n * USDC);
    expect(shares.get("big")).toBe(108n * USDC);
  });
});

describe("classifyHashlessPending", () => {
  it("fails a row whose send phase was never reached (no persisted nonce)", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 0, nonce: null, pendingNonceCount: 0, unclaimedSwapTxHashes: [] })
    ).toEqual({ kind: "fail", reason: "crashed before the transaction was sent" });
  });

  it("adopts the unclaimed SwapExecuted hash when the nonce was consumed", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 8, nonce: 7, pendingNonceCount: 8, unclaimedSwapTxHashes: ["0xlost"] })
    ).toEqual({ kind: "adopt", txHash: "0xlost" });
  });

  it("fails a consumed nonce with no SwapExecuted (reverted or replaced)", () => {
    const result = classifyHashlessPending({
      latestNonceCount: 8,
      nonce: 7,
      pendingNonceCount: 8,
      unclaimedSwapTxHashes: []
    });
    expect(result.kind).toBe("fail");
  });

  it("waits while the broadcast may still be in the mempool", () => {
    expect(
      classifyHashlessPending({ latestNonceCount: 7, nonce: 7, pendingNonceCount: 8, unclaimedSwapTxHashes: [] })
    ).toEqual({ kind: "in-flight" });
  });

  it("fails when the nonce was persisted but the broadcast never reached the mempool", () => {
    const result = classifyHashlessPending({
      latestNonceCount: 7,
      nonce: 7,
      pendingNonceCount: 7,
      unclaimedSwapTxHashes: []
    });
    expect(result).toEqual({ kind: "fail", reason: "broadcast never reached the mempool" });
  });
});
