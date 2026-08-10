import { afterAll, describe, expect, it, mock } from "bun:test";
// Captured before mock.module so afterAll can restore the real modules —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import {
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  signUnsignedTransactions
} from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import * as evmFundingNamespace from "../core/evm-funding";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import type { FlowMetadata } from "../core/metadata";
import type { SubsidyMetadata } from "../phases/subsidize-pre/simulation";

const sharedReal = { ...sharedNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const partnerPricingReal = { ...partnerPricingNamespace };

const EVM_EPHEMERAL_PRIVATE_KEY = "0x3434343434343434343434343434343434343434343434343434343434343434";
const EVM_EPHEMERAL_ADDRESS = privateKeyToAccount(EVM_EPHEMERAL_PRIVATE_KEY).address;
const DESTINATION_ADDRESS = "0x1212121212121212121212121212121212121212";
const FUNDING_ADDRESS = "0x9999999999999999999999999999999999999999";
const VORTEX_PAYOUT_ADDRESS = "0x8888888888888888888888888888888888888888";
const REQUEST = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Arbitrum
};

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createNablaTransactionsForOnrampOnEVM: async () => ({
    approve: { data: "0xc1", gas: "100000", to: "0x3333333333333333333333333333333333333333", value: "0" },
    swap: { data: "0xc2", gas: "500000", to: "0x3333333333333333333333333333333333333333", value: "0" }
  }),
  createOnrampSquidrouterTransactionsFromBaseToEvm: async () => ({
    approveData: { data: "0xa1", gas: "100000", to: "0x1111111111111111111111111111111111111111", value: "0" },
    squidRouterQuoteId: "squid-quote-id",
    squidRouterReceiverHash: "0xreceiverhash",
    squidRouterReceiverId: "receiver-id",
    swapData: { data: "0xa2", gas: "500000", to: "0x1111111111111111111111111111111111111111", value: "123" }
  }),
  createOnrampSquidrouterTransactionsOnDestinationChain: async () => ({
    approveData: { data: "0xb1", gas: "100000", to: "0x2222222222222222222222222222222222222222", value: "0" },
    swapData: { data: "0xb2", gas: "500000", to: "0x2222222222222222222222222222222222222222", value: "0" }
  }),
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n })
      })
    })
  },
  getNablaBasePool: () => ({ router: "0x4444444444444444444444444444444444444444" })
}));

mock.module("../core/evm-funding", () => ({
  getEvmFundingAccount: () => ({ address: FUNDING_ADDRESS })
}));

mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async (where: { name?: string; id?: string }) =>
    where.name === "vortex" ? { payoutAddressEvm: VORTEX_PAYOUT_ADDRESS } : null
}));

const { makeBrlOnrampBaseCrossChainFlow } = await import("../flows/brl-onramp-base-cross-chain");
const { prepareDestinationTransferTxs } = await import("../phases/destination-transfer/transactions");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

function buildQuote(): QuoteTicketAttributes {
  return {
    from: "pix",
    id: "quote-1",
    inputAmount: "100",
    inputCurrency: FiatToken.BRL,
    metadata: {
      aveniaTransfer: { outputAmountRaw: "98800000000000000000" },
      evmToEvm: { inputAmountRaw: "17600000" },
      fees: { usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" } },
      nablaSwapEvm: { inputAmountForSwapRaw: "98800000000000000000", outputAmountRaw: "18000000" }
    },
    network: Networks.Arbitrum,
    outputAmount: "17.5",
    outputCurrency: EvmToken.USDC,
    partnerId: null,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    to: Networks.Arbitrum
  } as unknown as QuoteTicketAttributes;
}

type BrlBlockMetadata = Awaited<
  ReturnType<ReturnType<typeof makeBrlOnrampBaseCrossChainFlow>["simulate"]>
>["metadata"]["blocks"];

function buildSubsidy(): SubsidyMetadata {
  return {
    actualOutputAmountDecimal: new Big("17.5"),
    actualOutputAmountRaw: "17500000",
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    applied: false,
    expectedOutputAmountDecimal: new Big("17.5"),
    expectedOutputAmountRaw: "17500000",
    idealSubsidyAmountInOutputTokenDecimal: new Big(0),
    idealSubsidyAmountInOutputTokenRaw: "0",
    partnerId: null,
    subsidyAmountInOutputTokenDecimal: new Big(0),
    subsidyAmountInOutputTokenRaw: "0",
    subsidyRate: new Big(0),
    targetOutputAmountDecimal: new Big("17.5"),
    targetOutputAmountRaw: "17500000"
  };
}

function buildMetadata(): FlowMetadata<BrlBlockMetadata> {
  const subsidy = buildSubsidy();
  return {
    blocks: {
      aveniaMint: {
        mint: {
          currency: FiatToken.BRL,
          fee: new Big(1),
          inputAmountDecimal: new Big(100),
          inputAmountRaw: "100000000000000000000",
          outputAmountDecimal: new Big("98.8"),
          outputAmountRaw: "98800000000000000000"
        },
        transfer: {
          currency: FiatToken.BRL,
          fee: new Big("0.5"),
          inputAmountDecimal: new Big("98.8"),
          inputAmountRaw: "98800000000000000000",
          outputAmountDecimal: new Big("98.3"),
          outputAmountRaw: "98300000000000000000"
        }
      },
      destinationTransfer: {
        amountDecimal: new Big("17.5"),
        amountRaw: "17500000",
        network: Networks.Arbitrum,
        token: EvmToken.USDC
      },
      distributeFees: {
        anchorFeeUsd: "0.1",
        networkFeeUsd: "0.1",
        partnerMarkupUsd: "0",
        totalFeesUsd: "0.2",
        vortexFeeUsd: "0.1"
      },
      finalSettlementSubsidy: { ...subsidy, amountRaw: "17500000", network: Networks.Arbitrum, token: EvmToken.USDC },
      fundEphemeral: { network: Networks.Base, token: EvmToken.BRLA },
      nablaSwap: {
        effectiveExchangeRate: "0.18",
        inputAmountForSwapDecimal: "98.8",
        inputAmountForSwapRaw: "98800000000000000000",
        inputCurrency: EvmToken.BRLA,
        inputDecimals: 18,
        inputToken: "0x1111111111111111111111111111111111111111",
        outputAmountDecimal: new Big(18),
        outputAmountRaw: "18000000",
        outputCurrency: EvmToken.USDC,
        outputDecimals: 6,
        outputToken: "0x2222222222222222222222222222222222222222"
      },
      squidRouterSwap: {
        effectiveExchangeRate: "0.99",
        fromNetwork: Networks.Base,
        fromToken: "0x2222222222222222222222222222222222222222",
        inputAmountDecimal: new Big("17.6"),
        inputAmountRaw: "17600000",
        networkFeeUSD: "0.1",
        outputAmountDecimal: new Big("17.5"),
        outputAmountRaw: "17500000",
        toNetwork: Networks.Arbitrum,
        toToken: "0x3333333333333333333333333333333333333333"
      },
      subsidizePostSwap: { ...subsidy, outputCurrency: EvmToken.USDC, outputDecimals: 6 },
      subsidizePreSwap: {
        expectedOutputAmountDecimal: new Big(18),
        expectedOutputAmountRaw: "18000000",
        inputCurrency: EvmToken.BRLA,
        inputDecimals: 18,
        network: Networks.Base,
        targetInputAmountRaw: "98800000000000000000"
      }
    },
    globals: {
      evmDestinationGas: {
        executionFeeUsd: "0.363",
        fundingGasLimit: "21000",
        isNativeTransfer: false,
        maximumFeePerGas: "1000000000",
        network: Networks.Arbitrum,
        programVersion: 2,
        transferGasLimit: "100000"
      },
      fees: { usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" } },
      partner: null,
      request: REQUEST
    }
  };
}

function buildPrepareCtx() {
  const { metadata: _metadata, ...quote } = buildQuote();
  return {
    destinationAddress: DESTINATION_ADDRESS,
    accounts: {
      [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM } as const
    },
    metadata: buildMetadata(),
    quote,
    registrationFacts: { aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" } }
  };
}

describe("BRL onramp Base cross-chain transactions", () => {
  it("assembles block-owned state and transaction calldata", async () => {
    const flow = makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
    const blocks = await flow.prepareTxs(buildPrepareCtx());

    expect(blocks.stateMeta.destinationAddress).toBe(DESTINATION_ADDRESS);
    expect(blocks.stateMeta.evmEphemeralAddress).toBe(EVM_EPHEMERAL_ADDRESS);
    expect(blocks.stateMeta.phaseFlow).toEqual([
      "initial",
      "brlaOnrampMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "squidRouterSwap",
      "squidRouterPay",
      "finalSettlementSubsidy",
      "destinationTransfer",
      "complete"
    ]);
    expect(blocks.stateMeta.blockState).toEqual({
      aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" },
      nablaSwap: { softMinimumOutputRaw: expect.any(String) },
      squidRouterSwap: {
        quoteId: "squid-quote-id",
        receiverHash: "0xreceiverhash",
        receiverId: "receiver-id"
      }
    });
    expect(blocks.stateMeta.transactionPlan).toEqual({
      nativePrefunding: { [`${Networks.Base}:${EVM_EPHEMERAL_ADDRESS.toLowerCase()}`]: "123" }
    });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "nablaApprove")?.txData).toMatchObject({ data: "0xc1" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "nablaSwap")?.txData).toMatchObject({ data: "0xc2" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "squidRouterApprove")?.txData).toMatchObject({ data: "0xa1" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "squidRouterSwap")?.txData).toMatchObject({ data: "0xa2" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "backupSquidRouterApprove")?.txData).toMatchObject({ data: "0xb1" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "backupSquidRouterSwap")?.txData).toMatchObject({ data: "0xb2" });
    expect(blocks.unsignedTxs.find(tx => tx.phase === "destinationTransfer")?.txData).toMatchObject({
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000"
    });
  });

  it("allocates the production nonce lanes per network", async () => {
    const flow = makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
    const { unsignedTxs } = await flow.prepareTxs(buildPrepareCtx());

    const tuples = unsignedTxs.map(tx => [tx.phase, tx.network, tx.nonce]);
    expect(tuples).toEqual(
      expect.arrayContaining([
        ["nablaApprove", Networks.Base, 0],
        ["nablaSwap", Networks.Base, 1],
        ["distributeFees", Networks.Base, 2],
        ["squidRouterApprove", Networks.Base, 3],
        ["squidRouterSwap", Networks.Base, 4],
        ["baseCleanupBrla", Networks.Base, 5],
        ["baseCleanupUsdc", Networks.Base, 6],
        ["destinationTransfer", Networks.Arbitrum, 0],
        ["backupSquidRouterApprove", Networks.Arbitrum, 1],
        ["backupSquidRouterSwap", Networks.Arbitrum, 2],
        ["backupApprove", Networks.Arbitrum, 0]
      ])
    );
    expect(unsignedTxs).toHaveLength(11);
    expect(unsignedTxs.every(tx => tx.signer === EVM_EPHEMERAL_ADDRESS)).toBe(true);
  });

  it("supports client-side signing for every prepared transaction", async () => {
    const blocks = await makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC).prepareTxs(buildPrepareCtx());
    const evmEphemeral = {
      address: EVM_EPHEMERAL_ADDRESS,
      secret: EVM_EPHEMERAL_PRIVATE_KEY,
      type: EphemeralAccountType.EVM
    };

    const presignedTxs = await signUnsignedTransactions(blocks.unsignedTxs, { evmEphemeral });
    expect(presignedTxs.length).toBeGreaterThanOrEqual(blocks.unsignedTxs.length);
    expect(presignedTxs.every(tx => typeof tx.txData === "string" && tx.txData.startsWith("0x"))).toBe(true);
    const destinationTransfer = presignedTxs.find(tx => tx.phase === "destinationTransfer");
    expect(destinationTransfer).toBeDefined();
    expect(parseTransaction(destinationTransfer?.txData as `0x${string}`).maxFeePerGas).toBe(3_000_000_000n);
  }, 60_000);

  it("preserves 18-decimal BSC USDT precision in the destination transfer", async () => {
    const amountRaw = "17500000000000000000";
    const prepared = await prepareDestinationTransferTxs({
      accounts: {
        [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM }
      },
      destinationAddress: DESTINATION_ADDRESS,
      globals: {} as never,
      ownMetadata: {
        amountDecimal: new Big("17.5"),
        amountRaw,
        network: Networks.BSC,
        token: EvmToken.USDT
      },
      ownRegistrationFacts: undefined,
      quote: {} as never
    });
    const txData = prepared.intents[0].txData as { data: `0x${string}` };
    const decoded = decodeFunctionData({ abi: erc20Abi, data: txData.data });
    expect(decoded.args).toEqual([DESTINATION_ADDRESS, BigInt(amountRaw)]);
  });
});
