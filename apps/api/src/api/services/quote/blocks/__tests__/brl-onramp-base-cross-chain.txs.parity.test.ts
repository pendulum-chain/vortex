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
  signUnsignedTransactions,
  UnsignedTx
} from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import * as evmFundingNamespace from "../../../phases/evm-funding";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import type { StateMetadata } from "../../../phases/meta-state-types";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import Big from "big.js";
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

mock.module("../../../phases/evm-funding", () => ({
  getEvmFundingAccount: () => ({ address: FUNDING_ADDRESS })
}));

mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async (where: { name?: string; id?: string }) =>
    where.name === "vortex" ? { payoutAddressEvm: VORTEX_PAYOUT_ADDRESS } : null
}));

const { prepareAveniaToEvmOnrampTransactionsOnBase } = await import("../../../transactions/onramp/routes/avenia-to-evm-base");
const { makeBrlOnrampBaseCrossChainFlow } = await import("../flows/brl-onramp-base-cross-chain");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../phases/evm-funding", () => ({ ...evmFundingReal }));
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
    evmEphemeral: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM },
    metadata: buildMetadata(),
    quote,
    taxId: "tax-123"
  };
}

const sortKey = (tx: UnsignedTx) => `${tx.network}|${tx.signer}|${tx.phase}|${tx.nonce}`;
const sortTxs = (txs: UnsignedTx[]) => [...txs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — transaction parity", () => {
  it("assembles the exact unsignedTxs and stateMeta the production route-prep produces", async () => {
    const production = await prepareAveniaToEvmOnrampTransactionsOnBase({
      destinationAddress: DESTINATION_ADDRESS,
      quote: buildQuote(),
      signingAccounts: [{ address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM }],
      taxId: "tax-123"
    });

    const flow = makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
    const blocks = await flow.prepareTxs(buildPrepareCtx());
    const productionState = production.stateMeta as Partial<StateMetadata>;

    expect(sortTxs(blocks.unsignedTxs)).toEqual(sortTxs(production.unsignedTxs));
    expect(blocks.stateMeta.destinationAddress).toBe(productionState.destinationAddress);
    expect(blocks.stateMeta.evmEphemeralAddress).toBe(productionState.evmEphemeralAddress);
    expect(blocks.stateMeta.phaseFlow).toEqual(productionState.phaseFlow);
    expect(blocks.stateMeta.blockState).toEqual({
      aveniaMint: { taxId: productionState.taxId },
      nablaSwap: { softMinimumOutputRaw: productionState.nablaSoftMinimumOutputRaw! },
      squidRouterSwap: {
        quoteId: productionState.squidRouterQuoteId!,
        receiverHash: productionState.squidRouterReceiverHash!,
        receiverId: productionState.squidRouterReceiverId!
      }
    });
    expect(blocks.stateMeta.transactionPlan).toEqual({
      nativePrefunding: { [`${Networks.Base}:${EVM_EPHEMERAL_ADDRESS.toLowerCase()}`]: "123" }
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

  // Temporary migration guard: remove once the block flow is the sole production source for quote
  // simulation, phase flow, and transaction preparation, leaving no legacy route-prep to compare.
  it("produces the same presigned transactions after client-side signing", async () => {
    const production = await prepareAveniaToEvmOnrampTransactionsOnBase({
      destinationAddress: DESTINATION_ADDRESS,
      quote: buildQuote(),
      signingAccounts: [{ address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM }],
      taxId: "tax-123"
    });
    const blocks = await makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC).prepareTxs(buildPrepareCtx());
    const evmEphemeral = {
      address: EVM_EPHEMERAL_ADDRESS,
      secret: EVM_EPHEMERAL_PRIVATE_KEY,
      type: EphemeralAccountType.EVM
    };

    const [productionPresignedTxs, blockPresignedTxs] = await Promise.all([
      signUnsignedTransactions(production.unsignedTxs, { evmEphemeral }),
      signUnsignedTransactions(blocks.unsignedTxs, { evmEphemeral })
    ]);

    expect(sortTxs(blockPresignedTxs)).toEqual(sortTxs(productionPresignedTxs));
  }, 60_000);
});
