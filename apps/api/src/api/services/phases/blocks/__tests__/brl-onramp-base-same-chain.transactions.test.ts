import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  Networks,
  RampDirection,
} from "@vortexfi/shared";
import Big from "big.js";
import { privateKeyToAccount } from "viem/accounts";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import * as evmFundingNamespace from "../core/evm-funding";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import type { FlowMetadata } from "../core/metadata";
import type { SubsidyMetadata } from "../phases/subsidize-pre/simulation";

const sharedReal = { ...sharedNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const partnerPricingReal = { ...partnerPricingNamespace };
const baseBuilderCalls: EvmToken[] = [];
const nablaHardMinimums: string[] = [];
const EVM_EPHEMERAL_ADDRESS = privateKeyToAccount(
  "0x3434343434343434343434343434343434343434343434343434343434343434"
).address;
const DESTINATION_ADDRESS = "0x1212121212121212121212121212121212121212";
const FUNDING_ADDRESS = "0x9999999999999999999999999999999999999999";
const VORTEX_PAYOUT_ADDRESS = "0x8888888888888888888888888888888888888888";
const BASE_OUTPUTS = [EvmToken.USDC, EvmToken.USDT, EvmToken.ETH, EvmToken.AXLUSDC, EvmToken.EURC] as const;

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createNablaTransactionsForOnrampOnEVM: async (...args: unknown[]) => {
    nablaHardMinimums.push(String(args[4]));
    return {
      approve: { data: "0xc1", gas: "100000", to: "0x3333333333333333333333333333333333333333", value: "0" },
      swap: { data: "0xc2", gas: "500000", to: "0x3333333333333333333333333333333333333333", value: "0" }
    };
  },
  createOnrampSquidrouterTransactionsFromBaseToEvm: async ({ toToken }: { toToken: string }) => {
    const token = Object.entries(sharedReal.evmTokenConfig[Networks.Base]).find(
      ([, details]) => details?.erc20AddressSourceChain.toLowerCase() === toToken.toLowerCase()
    )?.[0] as EvmToken;
    baseBuilderCalls.push(token);
    return {
      approveData: { data: "0xa1", gas: "100000", to: "0x1111111111111111111111111111111111111111", value: "0" },
      squidRouterQuoteId: `squid-${token}`,
      squidRouterReceiverHash: `hash-${token}`,
      squidRouterReceiverId: `receiver-${token}`,
      swapData: { data: "0xa2", gas: "500000", to: "0x1111111111111111111111111111111111111111", value: "123" }
    };
  },
  createOnrampSquidrouterTransactionsFromPolygonToEvm: async () => {
    throw new Error("BRL Base same-chain preparation must not call the Polygon builder");
  },
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
  findPartnerWithPricing: async (where: { name?: string }) =>
    where.name === "vortex" ? { payoutAddressEvm: VORTEX_PAYOUT_ADDRESS } : null
}));


const { brlOnrampBaseSameChainFlow, makeBrlOnrampBaseSameChainSwapFlow } = await import(
  "../flows/brl-onramp-base-same-chain"
);
const { prepareNablaSwapTxs } = await import("../phases/nabla-swap/transactions");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

function tokenDetails(outputCurrency: EvmToken): EvmTokenDetails {
  return sharedReal.evmTokenConfig[Networks.Base][outputCurrency] as EvmTokenDetails;
}

function outputAmountRaw(outputCurrency: EvmToken): string {
  return new Big("17.5").mul(new Big(10).pow(tokenDetails(outputCurrency).decimals)).toFixed(0, 0);
}

function buildRequest(outputCurrency: EvmToken) {
  return {
    from: EPaymentMethod.PIX,
    inputAmount: "100",
    inputCurrency: FiatToken.BRL,
    network: Networks.Base,
    outputCurrency,
    rampType: RampDirection.BUY,
    to: Networks.Base
  };
}

function buildQuote(outputCurrency: EvmToken): QuoteTicketAttributes {
  return {
    ...buildRequest(outputCurrency),
    id: `quote-${outputCurrency}`,
    metadata: {
      aveniaTransfer: { outputAmountRaw: "98800000000000000000" },
      evmToEvm: { inputAmountRaw: "17600000", outputAmountRaw: outputAmountRaw(outputCurrency) },
      fees: { usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" } },
      nablaSwapEvm: { inputAmountForSwapRaw: "98800000000000000000", outputAmountRaw: "18000000" }
    },
    outputAmount: "17.5",
    partnerId: null,
    pricingPartnerId: null
  } as unknown as QuoteTicketAttributes;
}

function subsidy(outputCurrency: EvmToken): SubsidyMetadata {
  const amountRaw = outputAmountRaw(outputCurrency);
  return {
    actualOutputAmountDecimal: new Big("17.5"),
    actualOutputAmountRaw: amountRaw,
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    applied: false,
    expectedOutputAmountDecimal: new Big("17.5"),
    expectedOutputAmountRaw: amountRaw,
    idealSubsidyAmountInOutputTokenDecimal: new Big(0),
    idealSubsidyAmountInOutputTokenRaw: "0",
    partnerId: null,
    subsidyAmountInOutputTokenDecimal: new Big(0),
    subsidyAmountInOutputTokenRaw: "0",
    subsidyRate: new Big(0),
    targetOutputAmountDecimal: new Big("17.5"),
    targetOutputAmountRaw: amountRaw
  };
}

function buildMetadata(outputCurrency: EvmToken): FlowMetadata {
  const postSwapSubsidy = subsidy(EvmToken.USDC);
  const details = tokenDetails(outputCurrency);
  const blocks: Record<string, unknown> = {
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
      amountRaw: outputAmountRaw(outputCurrency),
      network: Networks.Base,
      token: outputCurrency
    },
    distributeFees: {
      anchorFeeUsd: "0.1",
      networkFeeUsd: "0.1",
      partnerMarkupUsd: "0",
      totalFeesUsd: "0.2",
      vortexFeeUsd: "0.1"
    },
    fundEphemeral: { network: Networks.Base, token: EvmToken.BRLA },
    nablaSwap: {
      effectiveExchangeRate: "0.18",
      inputAmountForSwapDecimal: "98.8",
      inputAmountForSwapRaw: "98800000000000000000",
      inputCurrency: EvmToken.BRLA,
      inputDecimals: 18,
      inputToken: sharedReal.evmTokenConfig[Networks.Base][EvmToken.BRLA]!.erc20AddressSourceChain,
      outputAmountDecimal: new Big(18),
      outputAmountRaw: "18000000",
      outputCurrency: EvmToken.USDC,
      outputDecimals: 6,
      outputToken: sharedReal.evmTokenConfig[Networks.Base][EvmToken.USDC]!.erc20AddressSourceChain
    },
    subsidizePostSwap: { ...postSwapSubsidy, outputCurrency: EvmToken.USDC, outputDecimals: 6 },
    subsidizePreSwap: {
      expectedOutputAmountDecimal: new Big(18),
      expectedOutputAmountRaw: "18000000",
      inputCurrency: EvmToken.BRLA,
      inputDecimals: 18,
      network: Networks.Base,
      targetInputAmountRaw: "98800000000000000000"
    }
  };
  if (outputCurrency !== EvmToken.USDC) {
    blocks.squidRouterSwap = {
      effectiveExchangeRate: "0.99",
      fromNetwork: Networks.Base,
      fromToken: sharedReal.evmTokenConfig[Networks.Base][EvmToken.USDC]!.erc20AddressSourceChain,
      inputAmountDecimal: new Big("17.6"),
      inputAmountRaw: "17600000",
      networkFeeUSD: "0.1",
      outputAmountDecimal: new Big("17.5"),
      outputAmountRaw: outputAmountRaw(outputCurrency),
      toNetwork: Networks.Base,
      toToken: details.erc20AddressSourceChain
    };
  }
  return {
    blocks,
    globals: {
      fees: { usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" } },
      partner: null,
      request: buildRequest(outputCurrency)
    }
  };
}

describe("BRL Base same-chain transactions", () => {
  for (const outputCurrency of BASE_OUTPUTS) {
    it(`preserves state, transactions, and nonce order for Base ${outputCurrency}`, async () => {
      baseBuilderCalls.length = 0;
      const quote = buildQuote(outputCurrency);
      const flow =
        outputCurrency === EvmToken.USDC
          ? brlOnrampBaseSameChainFlow
          : makeBrlOnrampBaseSameChainSwapFlow(outputCurrency);
      const { metadata: _metadata, ...quoteFields } = quote;
      const prepared = await flow.prepareTxs({
        accounts: { [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM } },
        destinationAddress: DESTINATION_ADDRESS,
        metadata: buildMetadata(outputCurrency) as never,
        quote: quoteFields as never,
        registrationFacts: { aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" } }
      });
      expect(prepared.unsignedTxs.every(tx => tx.network === Networks.Base && tx.signer === EVM_EPHEMERAL_ADDRESS)).toBe(true);
      expect(prepared.stateMeta.phaseFlow).toEqual(
        outputCurrency === EvmToken.USDC
          ? [
              "initial",
              "brlaOnrampMint",
              "fundEphemeral",
              "subsidizePreSwap",
              "nablaApprove",
              "nablaSwap",
              "distributeFees",
              "subsidizePostSwap",
              "destinationTransfer",
              "complete"
            ]
          : [
              "initial",
              "brlaOnrampMint",
              "fundEphemeral",
              "subsidizePreSwap",
              "nablaApprove",
              "nablaSwap",
              "distributeFees",
              "subsidizePostSwap",
              "squidRouterSwap",
              "destinationTransfer",
              "complete"
            ]
      );
      expect(prepared.stateMeta.blockState).toEqual({
        aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" },
        nablaSwap: { softMinimumOutputRaw: expect.any(String) },
        ...(outputCurrency === EvmToken.USDC
          ? {}
          : {
              squidRouterSwap: {
                quoteId: `squid-${outputCurrency}`,
                receiverHash: `hash-${outputCurrency}`,
                receiverId: `receiver-${outputCurrency}`
              }
            })
      });
      expect(prepared.stateMeta.transactionPlan).toEqual({
        nativePrefunding:
          outputCurrency === EvmToken.USDC
            ? {}
            : { [`${Networks.Base}:${EVM_EPHEMERAL_ADDRESS.toLowerCase()}`]: "123" }
      });
      expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.nonce])).toEqual(
        outputCurrency === EvmToken.USDC
          ? [
              ["nablaApprove", 0],
              ["nablaSwap", 1],
              ["distributeFees", 2],
              ["destinationTransfer", 3],
              ["baseCleanupBrla", 4],
              ["baseCleanupUsdc", 5]
            ]
          : [
              ["nablaApprove", 0],
              ["nablaSwap", 1],
              ["distributeFees", 2],
              ["squidRouterApprove", 3],
              ["squidRouterSwap", 4],
              ["destinationTransfer", 5],
              ["baseCleanupBrla", 6],
              ["baseCleanupUsdc", 7]
            ]
      );
      expect(prepared.unsignedTxs.some(tx => tx.phase.startsWith("backup"))).toBe(false);
      expect(prepared.unsignedTxs.find(tx => tx.phase === "nablaApprove")?.txData).toMatchObject({ data: "0xc1" });
      expect(prepared.unsignedTxs.find(tx => tx.phase === "nablaSwap")?.txData).toMatchObject({ data: "0xc2" });
      if (outputCurrency !== EvmToken.USDC) {
        expect(prepared.unsignedTxs.find(tx => tx.phase === "squidRouterApprove")?.txData).toMatchObject({ data: "0xa1" });
        expect(prepared.unsignedTxs.find(tx => tx.phase === "squidRouterSwap")?.txData).toMatchObject({ data: "0xa2" });
      }
      expect(baseBuilderCalls).toEqual(outputCurrency === EvmToken.USDC ? [] : [outputCurrency]);
    });
  }

  it("uses the AMM-only output for Nabla minimums when an offramp subsidy is present", async () => {
    nablaHardMinimums.length = 0;
    const prepared = await prepareNablaSwapTxs(
      Networks.Base,
      EvmToken.BRLA,
      EvmToken.USDC,
      {
        accounts: { [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: {
          ammOutputAmountRaw: "1000000",
          inputAmountForSwapDecimal: "1",
          inputAmountForSwapRaw: "1000000000000000000",
          inputCurrency: EvmToken.BRLA,
          inputDecimals: 18,
          inputToken: tokenDetails(EvmToken.BRLA).erc20AddressSourceChain,
          outputAmountDecimal: new Big(2),
          outputAmountRaw: "2000000",
          outputCurrency: EvmToken.USDC,
          outputDecimals: 6,
          outputToken: tokenDetails(EvmToken.USDC).erc20AddressSourceChain
        },
        ownRegistrationFacts: undefined,
        quote: {} as never
      },
      false
    );
    expect(nablaHardMinimums).toEqual([
      Big(1_000_000)
        .mul(1 - sharedReal.AMM_MINIMUM_OUTPUT_HARD_MARGIN)
        .toFixed(0, 0)
    ]);
    expect(prepared.state).toEqual({
      softMinimumOutputRaw: Big(1_000_000)
        .mul(1 - sharedReal.AMM_MINIMUM_OUTPUT_SOFT_MARGIN)
        .toFixed(0, 0)
    });
  });
});
