import { describe, expect, it } from "bun:test";
import { type EvmNetworks, type EvmTransactionData, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { APIError } from "../../../../errors/api-error";
import {
  assertPreparedEvmDestinationFeeWithinQuote,
  assertEvmTreasuryFundingFeeWithinQuote,
  calculateBoundedPresignedGasBudgetRaw,
  calculateExpectedExecutionFeeRaw,
  calculatePresignedExecutionBudgetRaw,
  EVM_ERC20_TRANSFER_GAS_LIMIT,
  EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES,
  EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES,
  getBaseL1FeeUpperBoundRaw,
  getEvmDestinationExecutionFeeUsd,
  getEvmNativeFeeCurrency
} from "./evm-destination-gas";
import type { PhaseCtx } from "./types";
import { privateKeyToAccount } from "viem/accounts";
import { installFakeEvm } from "../../../../../test-utils/fake-world/fake-evm";

describe("EVM destination gas policy", () => {
  it("prices the funding transfer and ERC-20 payout with the configured margin", () => {
    expect(calculateExpectedExecutionFeeRaw(1_000_000_000n, EVM_ERC20_TRANSFER_GAS_LIMIT, 12_000)).toBe(
      145_200_000_000_000n
    );
  });

  it("includes Base L1 security fees before applying the configured margin", () => {
    expect(calculateExpectedExecutionFeeRaw(1_000_000_000n, EVM_ERC20_TRANSFER_GAS_LIMIT, 12_000, 20_000n)).toBe(
      145_200_000_024_000n
    );
  });

  it("refuses to derive a treasury liability outside the server-issued gas envelope", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const rawTransaction = await account.signTransaction({
      chainId: 137,
      gas: 100_001n,
      maxFeePerGas: 3_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
      to: "0x0000000000000000000000000000000000000001",
      type: "eip1559",
      value: 0n
    });

    expect(() => calculateBoundedPresignedGasBudgetRaw(rawTransaction, transaction("1000000000"))).toThrow(
      "server-issued gas envelope"
    );
  });

  it("adds the exact Base L1 fee to the presigned payout liability", async () => {
    const { fakeEvm, restore } = installFakeEvm();
    try {
      const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
      const rawTransaction = await account.signTransaction({
        chainId: 8453,
        gas: 100_000n,
        maxFeePerGas: 3_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
        to: "0x0000000000000000000000000000000000000001",
        type: "eip1559",
        value: 0n
      });

      expect(await calculatePresignedExecutionBudgetRaw(rawTransaction, Networks.Base)).toBe(
        300_000_000_000_000n + fakeEvm.baseL1FeeRaw
      );
      expect(await getBaseL1FeeUpperBoundRaw(Networks.Base, EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES)).toBe(
        fakeEvm.baseL1FeeUpperBoundRaw
      );
      expect(await getBaseL1FeeUpperBoundRaw(Networks.BaseSepolia, EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES)).toBe(
        fakeEvm.baseL1FeeUpperBoundRaw
      );
      expect(await getBaseL1FeeUpperBoundRaw(Networks.Arbitrum, EVM_NATIVE_UNSIGNED_TRANSACTION_SIZE_BYTES)).toBe(0n);
    } finally {
      restore();
    }
  });

  it("rejects a Base treasury transfer when its current L1 fee exceeds the quote envelope", async () => {
    const { fakeEvm, restore } = installFakeEvm();
    try {
      const quote = {
        executionFeeUsd: "0.20",
        fundingL1FeeUpperBoundRaw: fakeEvm.baseL1FeeUpperBoundRaw.toString(),
        maxFeePerGas: "1000000000",
        network: Networks.Base as EvmNetworks,
        payoutL1FeeUpperBoundRaw: fakeEvm.baseL1FeeUpperBoundRaw.toString(),
        transferGasLimit: "100000"
      };
      fakeEvm.baseL1FeeUpperBoundRaw = 12_000_000_000_001n;

      await expect(assertEvmTreasuryFundingFeeWithinQuote(quote, Networks.Base, 1_000_000_000n)).rejects.toThrow(
        QuoteError.NetworkFeesTooHigh
      );
    } finally {
      restore();
    }
  });

  it("rejects a Base treasury transfer when the payout L1 fee exceeds the quote envelope", async () => {
    const { fakeEvm, restore } = installFakeEvm();
    try {
      const quote = {
        executionFeeUsd: "0.20",
        fundingL1FeeUpperBoundRaw: fakeEvm.baseL1FeeUpperBoundRaw.toString(),
        maxFeePerGas: "1000000000",
        network: Networks.Base as EvmNetworks,
        payoutL1FeeUpperBoundRaw: fakeEvm.baseL1FeeUpperBoundRaw.toString(),
        transferGasLimit: EVM_ERC20_TRANSFER_GAS_LIMIT.toString()
      };
      fakeEvm.onReadContract = (_network, params) => {
        if (params.functionName !== "getL1FeeUpperBound") return undefined;
        return params.args?.[0] === EVM_ERC20_UNSIGNED_TRANSACTION_SIZE_BYTES
          ? 12_000_000_000_001n
          : fakeEvm.baseL1FeeUpperBoundRaw;
      };

      await expect(assertEvmTreasuryFundingFeeWithinQuote(quote, Networks.Base, 1_000_000_000n)).rejects.toThrow(
        QuoteError.NetworkFeesTooHigh
      );
    } finally {
      restore();
    }
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

  it("does not price destination gas for exact provider-direct payouts", async () => {
    const ctx = {
      priceEvmDestinationGas: false,
      request: { rampType: RampDirection.BUY, to: Networks.Base }
    } as PhaseCtx;

    expect(await getEvmDestinationExecutionFeeUsd(ctx)).toBe("0");
    expect(ctx.evmDestinationGas).toBeUndefined();
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
