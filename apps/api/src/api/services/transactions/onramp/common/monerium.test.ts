import { describe, expect, it } from "bun:test";
import { MONERIUM_SELF_TRANSFER_GAS_LIMIT } from "./monerium";

describe("MONERIUM_SELF_TRANSFER_GAS_LIMIT", () => {
  it("keeps enough room for EURe v2 transferFrom compliance checks", () => {
    expect(BigInt(MONERIUM_SELF_TRANSFER_GAS_LIMIT)).toBeGreaterThan(100000n);
  });
});
