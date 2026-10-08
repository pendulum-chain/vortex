import { describe, expect, it } from "bun:test";
import { refundAccountFor } from "./refund-wallet";

const SEED = `0x${"11".repeat(32)}`;
const PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("refund wallet derivation", () => {
  it("derives one stable wallet per Monerium profile from the seed", () => {
    const wallet = refundAccountFor(PROFILE, SEED);
    expect(refundAccountFor(PROFILE.toUpperCase(), SEED).address).toBe(wallet.address);
    expect(refundAccountFor("1c9f8d3b-9a5f-4e54-8a3c-3a0a4d2e6b7f", SEED).address).not.toBe(wallet.address);
    expect(refundAccountFor(PROFILE, `0x${"22".repeat(32)}`).address).not.toBe(wallet.address);
  });

  it("refuses to derive without a seed", () => {
    expect(() => refundAccountFor(PROFILE, "")).toThrow("MONERIUM_B2B_REFUND_SEED");
  });
});
