import { describe, expect, it } from "bun:test";
import { type EvmNetworks, type EvmTransactionData, Networks, QuoteError } from "@vortexfi/shared";
import { APIError } from "../../../../errors/api-error";
import {
  assertPreparedEvmDestinationFeeWithinQuote,
  calculateExpectedExecutionFeeRaw,
  EVM_ERC20_TRANSFER_GAS_LIMIT,
  getEvmNativeFeeCurrency
} from "./evm-destination-gas";

describe("EVM destination gas policy", () => {
  it("prices the funding transfer and ERC-20 payout with the configured margin", () => {
    expect(calculateExpectedExecutionFeeRaw(1_000_000_000n, EVM_ERC20_TRANSFER_GAS_LIMIT, 12_000)).toBe(
      145_200_000_000_000n
    );
  });

  it("maps every EVM network to the native currency used to price its gas", () => {
    const expected: Record<EvmNetworks, string> = {
      [Networks.Arbitrum]: "ETH",
      [Networks.Avalanche]: "AVAX",
      [Networks.Base]: "ETH",
      [Networks.BaseSepolia]: "ETH",
      [Networks.BSC]: "BNB",
      [Networks.Ethereum]: "ETH",
      [Networks.Moonbeam]: "GLMR",
      [Networks.Polygon]: "MATIC",
      [Networks.PolygonAmoy]: "MATIC"
    };

    for (const [network, currency] of Object.entries(expected)) {
      expect(String(getEvmNativeFeeCurrency(network as EvmNetworks))).toBe(currency);
    }
  });

  it("allows registration-time fee movement inside the quote margin", () => {
    expect(() =>
      assertPreparedEvmDestinationFeeWithinQuote(
        { executionFeeUsd: "0.20", maxFeePerGas: "100", network: Networks.Arbitrum, transferGasLimit: "100000" },
        Networks.Arbitrum,
        transaction("120")
      )
    ).not.toThrow();
  });

  it("rejects registration when the destination fee moved beyond the quote margin", () => {
    let thrown: unknown;
    try {
      assertPreparedEvmDestinationFeeWithinQuote(
        { executionFeeUsd: "0.20", maxFeePerGas: "100", network: Networks.BSC, transferGasLimit: "100000" },
        Networks.BSC,
        transaction("121")
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).message).toBe(QuoteError.NetworkFeesTooHigh);
  });
});

function transaction(maxFeePerGas: string): EvmTransactionData {
  return {
    data: "0x",
    gas: "100000",
    maxFeePerGas,
    maxPriorityFeePerGas: "1",
    to: "0x0000000000000000000000000000000000000001",
    value: "0"
  };
}
