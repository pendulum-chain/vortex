import {beforeEach, describe, expect, it, mock} from "bun:test";
import Big from "big.js";

const EVM_EPHEMERAL_ADDRESS = "0x1111111111111111111111111111111111111111";
const DESTINATION_ADDRESS = "0x2222222222222222222222222222222222222222";
const FUNDING_ADDRESS = "0x3333333333333333333333333333333333333333";
const BRLA_BASE = "0xfCB34c47f850f452C15EA1B84d51231C38A61783";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const AXL_USDC_BSC = "0x4268B8F0B87b6Eae5d897996E6b845ddbD99Adf3";

const Networks = {
  BSC: "bsc",
  Base: "base",
  Ethereum: "ethereum"
} as const;

const EvmToken = {
  AXLUSDC: "AXLUSDC",
  USDC: "USDC",
  USDT: "USDT"
} as const;

const FiatToken = {
  BRL: "BRL",
  EURC: "EUR"
} as const;

const destinationTransferCalls: Array<{ amountRaw: string; destinationNetwork: string }> = [];

const addOnrampDestinationChainTransactions = mock(async (params: { amountRaw: string; destinationNetwork: string }) => {
  destinationTransferCalls.push(params);
  if (!/^\d+$/.test(params.amountRaw)) {
    throw new Error(`expected integer raw amount, got ${params.amountRaw}`);
  }
  return {
    data: "0xdestination",
    gas: "100000",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "1",
    to: DESTINATION_ADDRESS,
    value: "0"
  };
});

mock.module("@vortexfi/shared", () => ({
  createOnrampSquidrouterTransactionsFromBaseToEvm: mock(async () => ({
    approveData: { data: "0xapprove", gas: "100000", to: USDC_BASE, value: "0" },
    squidRouterQuoteId: "quote",
    squidRouterReceiverHash: "0xreceiverhash",
    squidRouterReceiverId: "receiver",
    swapData: { data: "0xswap", gas: "200000", to: USDC_BASE, value: "0" }
  })),
  createOnrampSquidrouterTransactionsOnDestinationChain: mock(async () => ({
    approveData: { data: "0xbackupapprove", gas: "100000", to: AXL_USDC_BSC, value: "0" },
    swapData: { data: "0xbackupswap", gas: "200000", to: AXL_USDC_BSC, value: "0" }
  })),
  EvmToken,
  FiatToken,
  evmTokenConfig: {
    [Networks.Base]: {
      [EvmToken.USDC]: {
        assetSymbol: "USDC",
        decimals: 6,
        erc20AddressSourceChain: USDC_BASE,
        isNative: false,
        network: Networks.Base,
        type: "evm"
      }
    },
    [Networks.BSC]: {
      [EvmToken.AXLUSDC]: {
        assetSymbol: "axlUSDC",
        decimals: 6,
        erc20AddressSourceChain: AXL_USDC_BSC,
        isNative: false,
        network: Networks.BSC,
        type: "evm"
      },
      [EvmToken.USDT]: {
        assetSymbol: "USDT",
        decimals: 18,
        erc20AddressSourceChain: USDT_BSC,
        isNative: false,
        network: Networks.BSC,
        type: "evm"
      }
    },
    [Networks.Ethereum]: {
      [EvmToken.USDC]: {
        assetSymbol: "USDC",
        decimals: 6,
        erc20AddressSourceChain: USDC_BASE,
        isNative: false,
        network: Networks.Ethereum,
        type: "evm"
      }
    }
  },
  getOnChainTokenDetailsOrDefault: mock(() => ({
    assetSymbol: "axlUSDC",
    decimals: 6,
    erc20AddressSourceChain: AXL_USDC_BSC,
    isNative: false,
    network: Networks.BSC,
    type: "evm"
  })),
  isEvmTokenDetails: () => true,
  isNativeEvmToken: (details: { isNative?: boolean }) => details.isNative === true,
  multiplyByPowerOfTen: (value: Big.BigSource, power: number) => {
    const result = new Big(value);
    if (result.c[0] !== 0) result.e += power;
    return result;
  },
  Networks
}));

mock.module("../common/validation", () => ({
  validateAveniaOnrampOnBase: mock(() => ({
    evmEphemeralEntry: {
      address: EVM_EPHEMERAL_ADDRESS,
      type: "EVM"
    },
    inputTokenDetails: {
      assetSymbol: "BRLA",
      decimals: 18,
      erc20AddressSourceChain: BRLA_BASE,
      isNative: false,
      network: Networks.Base,
      type: "evm"
    },
    outputTokenDetails: {
      assetSymbol: "USDT",
      decimals: 18,
      erc20AddressSourceChain: USDT_BSC,
      isNative: false,
      network: Networks.BSC,
      type: "evm"
    },
    toNetwork: Networks.BSC
  }))
}));

mock.module("../common/transactions", () => ({
  addDestinationChainApprovalTransaction: mock(async () => ({
    data: "0xbackupapprove",
    gas: "100000",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "1",
    to: AXL_USDC_BSC,
    value: "0"
  })),
  addNablaSwapTransactionsOnBase: mock(async (_params, _unsignedTxs, nextNonce: number) => ({
    nextNonce: nextNonce + 2,
    stateMeta: { nablaSoftMinimumOutputRaw: "4818988497" }
  })),
  addOnrampDestinationChainTransactions
}));

mock.module("../../common/feeDistribution", () => ({
  addEvmFeeDistributionTransaction: mock(async (_quote, _account, _unsignedTxs, nextNonce: number) => nextNonce)
}));

mock.module("../../base/cleanup", () => ({
  prepareBaseCleanupApproval: mock(async () => ({
    data: "0xcleanup",
    gas: "100000",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "1",
    to: USDC_BASE,
    value: "0"
  }))
}));

mock.module("../../index", () => ({
  encodeEvmTransactionData: (data: unknown) => data
}));

mock.module("../../../phases/evm-funding", () => ({
  getEvmFundingAccount: () => ({ address: FUNDING_ADDRESS })
}));

mock.module("../../../../../config/logger", () => ({
  default: {
    debug: mock(() => undefined)
  }
}));

const { prepareAveniaToEvmOnrampTransactionsOnBase } = await import("./avenia-to-evm-base");

describe("prepareAveniaToEvmOnrampTransactionsOnBase", () => {
  beforeEach(() => {
    destinationTransferCalls.length = 0;
    addOnrampDestinationChainTransactions.mockClear();
  });

  it("preserves 18-decimal BSC USDT precision for the final destination raw amount", async () => {
    await prepareAveniaToEvmOnrampTransactionsOnBase({
      destinationAddress: DESTINATION_ADDRESS,
      quote: {
        inputCurrency: "BRL",
        metadata: {
          aveniaTransfer: {
            outputAmountRaw: "25002249808000000000000"
          },
          evmToEvm: {
            inputAmountRaw: "4818926798"
          },
          nablaSwapEvm: {
            inputAmountForSwapRaw: "25002249808000000000000",
            outputAmountRaw: "4818988497"
          }
        },
        network: Networks.BSC,
        outputAmount: "4817.805726163073314321",
        outputCurrency: EvmToken.USDT,
        to: Networks.BSC
      } as never,
      signingAccounts: [{ address: EVM_EPHEMERAL_ADDRESS, type: "EVM" }] as never,
      taxId: "12345678901"
    });

    expect(destinationTransferCalls).toContainEqual(
      expect.objectContaining({
        amountRaw: "4817805726163073314321",
        destinationNetwork: Networks.BSC
      })
    );
  });
});
