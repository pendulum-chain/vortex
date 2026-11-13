import { describe, expect, it } from "bun:test";
import { calculateNablaFeeSubsidy } from "./nabla-fee-subsidy";

describe("Nabla fee-only subsidy", () => {
  it("leaves 5 bps of a 25 bps DEX fee on a 1000 USDC gross output", () => {
    expect(calculateNablaFeeSubsidy("997500000", "2500000", 5, 20)).toEqual({
      chargedFeeRaw: "2500000", grossOutputRaw: "1000000000", rebateRaw: "2000000", targetFeeRaw: "500000", targetFeeBps: 5
    });
  });
  it("uses the actual fee instead of a fixed 20 bps subsidy", () => {
    expect(calculateNablaFeeSubsidy("998500000", "1500000", 5, 20).rebateRaw).toBe("1000000");
  });
  it("never raises a fee already below the target", () => {
    expect(calculateNablaFeeSubsidy("999800000", "200000", 5, 20)).toMatchObject({ rebateRaw: "0", targetFeeRaw: "200000" });
  });
  it("uses the pool output, never the customer's input or an FX reference, as its fee basis", () => {
    const x = calculateNablaFeeSubsidy("987525000", "2475000", 5, 20);
    expect(x.rebateRaw).toBe("1980000");
    expect(x.grossOutputRaw).toBe("990000000");
  });
  it("preserves BRLA's 18-decimal precision", () => {
    expect(calculateNablaFeeSubsidy("997500000000000000000", "2500000000000000000", 5, 20).rebateRaw).toBe("2000000000000000000");
  });
  it("rounds the retained fee up, keeping the rebate inside the configured budget", () => {
    const x = calculateNablaFeeSubsidy("997500001", "2500000", 5, 20);
    expect(BigInt(x.rebateRaw)).toBeLessThanOrEqual(BigInt(x.grossOutputRaw) * 20n / 10000n);
    expect(BigInt(x.targetFeeRaw)).toBeGreaterThanOrEqual(BigInt(x.grossOutputRaw) * 5n / 10000n);
  });
  it("fails closed when a fee increase needs more subsidy than configured", () => {
    expect(() => calculateNablaFeeSubsidy("997000000", "3000000", 5, 20)).toThrow("exceeds its configured budget");
  });
  it.each([[-1,20],[5,-1],[1.5,20],[5,10001]])("rejects invalid target/cap %s/%s", (target,cap) => {
    expect(() => calculateNablaFeeSubsidy("1000", "1", target,cap)).toThrow();
  });
});
