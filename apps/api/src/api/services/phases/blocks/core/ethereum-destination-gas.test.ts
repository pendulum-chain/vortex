import { describe, expect, it } from "bun:test";
import { QuoteError } from "@vortexfi/shared";
import { parseEther } from "viem";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";
import {
  assertEthereumGasBudgetWithinLimit,
  calculateExpectedExecutionFeeRaw,
  EVM_ERC20_TRANSFER_GAS_LIMIT
} from "./ethereum-destination-gas";

describe("Ethereum destination gas policy", () => {
  it("prices the funding transfer and ERC-20 payout with the configured margin", () => {
    expect(calculateExpectedExecutionFeeRaw(1_000_000_000n, EVM_ERC20_TRANSFER_GAS_LIMIT, 12_000)).toBe(
      145_200_000_000_000n
    );
  });

  it("rejects signed gas budgets above the configured circuit breaker", () => {
    const aboveLimit = parseEther(config.ethereumOnramp.maxGasFundingUnits) + 1n;
    let thrown: unknown;

    try {
      assertEthereumGasBudgetWithinLimit(aboveLimit);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).message).toBe(QuoteError.NetworkFeesTooHigh);
  });
});
