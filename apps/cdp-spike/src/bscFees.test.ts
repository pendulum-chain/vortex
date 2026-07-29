import { describe, expect, test } from "bun:test";
import { getBscEip1559Fees } from "./bscFees";

describe("getBscEip1559Fees", () => {
  test("uses the network gas price as the nonzero priority fee", () => {
    expect(getBscEip1559Fees(100_000_000n)).toEqual({
      maxFeePerGas: 100_000_000n,
      maxPriorityFeePerGas: 100_000_000n
    });
  });
});
