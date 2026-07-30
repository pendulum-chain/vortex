import { describe, expect, it } from "bun:test";
import { AllocatableDeposit, allocateUsdcProRata, selectDepositsForExecution } from "./conversion-executor";

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

  it("selects nothing when even the oldest deposit exceeds eureInRaw", () => {
    expect(selectDepositsForExecution([deposit("a", 100n * EUR)], 60n * EUR)).toEqual([]);
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
});
