import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  Networks,
  RampDirection
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
const EPHEMERAL = privateKeyToAccount("0x3434343434343434343434343434343434343434343434343434343434343434").address;
const DESTINATION = "0x1212121212121212121212121212121212121212";
const FUNDING = "0x9999999999999999999999999999999999999999";
const OUTPUTS = [EvmToken.USDC, EvmToken.USDT, EvmToken.ETH, EvmToken.AXLUSDC, EvmToken.BRLA] as const;

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createNablaTransactionsForOnrampOnEVM: async () => ({
    approve: { data: "0xc1", gas: "100000", to: "0x3333333333333333333333333333333333333333", value: "0" },
    swap: { data: "0xc2", gas: "500000", to: "0x3333333333333333333333333333333333333333", value: "0" }
  }),
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
    throw new Error("EUR Base same-chain preparation must not call the Polygon builder");
  },
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({ estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n }) })
    })
  },
  getNablaBasePool: () => ({ router: "0x4444444444444444444444444444444444444444" })
}));
mock.module("../core/evm-funding", () => ({ getEvmFundingAccount: () => ({ address: FUNDING }) }));
mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async () => ({ payoutAddressEvm: "0x8888888888888888888888888888888888888888" })
}));

const { eurOnrampBaseSameChainFlow, makeEurOnrampBaseSameChainSwapFlow } = await import(
  "../flows/eur-onramp-base-same-chain"
);

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

function details(token: EvmToken): EvmTokenDetails {
  return sharedReal.evmTokenConfig[Networks.Base][token] as EvmTokenDetails;
}

function outputAmountRaw(token: EvmToken): string {
  return new Big("17.5").mul(new Big(10).pow(details(token).decimals)).toFixed(0, 0);
}

function request(outputCurrency: EvmToken) {
  return {
    from: EPaymentMethod.SEPA,
    inputAmount: "100",
    inputCurrency: FiatToken.EURC,
    network: Networks.Base,
    outputCurrency,
    rampType: RampDirection.BUY,
    to: Networks.Base
  };
}

function quote(outputCurrency: EvmToken): QuoteTicketAttributes {
  return {
    ...request(outputCurrency),
    id: `quote-${outputCurrency}`,
    metadata: {
      evmToEvm: { inputAmountRaw: "17600000", outputAmountRaw: outputAmountRaw(outputCurrency) },
      fees: { usd: { anchor: "0.06", network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" } },
      mykoboMint: { outputAmountRaw: "99940000" },
      nablaSwapEvm: { inputAmountForSwapRaw: "99940000", outputAmountRaw: "18000000" }
    },
    outputAmount: "17.5",
    partnerId: null,
    pricingPartnerId: null
  } as unknown as QuoteTicketAttributes;
}

function subsidy(token: EvmToken): SubsidyMetadata {
  const amountRaw = outputAmountRaw(token);
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

function metadata(outputCurrency: EvmToken): FlowMetadata {
  const blocks: Record<string, unknown> = {
    destinationTransfer: {
      amountDecimal: new Big("17.5"),
      amountRaw: outputAmountRaw(outputCurrency),
      network: Networks.Base,
      token: outputCurrency
    },
    distributeFees: {
      anchorFeeUsd: "0.06",
      networkFeeUsd: "0.1",
      partnerMarkupUsd: "0",
      totalFeesUsd: "0.26",
      vortexFeeUsd: "0.1"
    },
    fundEphemeral: { network: Networks.Base, token: EvmToken.EURC },
    mykoboMint: {
      mint: {
        currency: FiatToken.EURC,
        fee: new Big("0.06"),
        inputAmountDecimal: new Big(100),
        inputAmountRaw: "100000000",
        outputAmountDecimal: new Big("99.94"),
        outputAmountRaw: "99940000"
      }
    },
    nablaSwap: {
      effectiveExchangeRate: "1.08",
      inputAmountForSwapDecimal: "99.94",
      inputAmountForSwapRaw: "99940000",
      inputCurrency: EvmToken.EURC,
      inputDecimals: 6,
      inputToken: details(EvmToken.EURC).erc20AddressSourceChain,
      outputAmountDecimal: new Big(18),
      outputAmountRaw: "18000000",
      outputCurrency: EvmToken.USDC,
      outputDecimals: 6,
      outputToken: details(EvmToken.USDC).erc20AddressSourceChain
    },
    subsidizePostSwap: { ...subsidy(EvmToken.USDC), outputCurrency: EvmToken.USDC, outputDecimals: 6 },
    subsidizePreSwap: {
      expectedOutputAmountDecimal: new Big(18),
      expectedOutputAmountRaw: "18000000",
      inputCurrency: EvmToken.EURC,
      inputDecimals: 6,
      network: Networks.Base,
      targetInputAmountRaw: "99940000"
    }
  };
  if (outputCurrency !== EvmToken.USDC) {
    blocks.squidRouterSwap = {
      effectiveExchangeRate: "0.99",
      fromNetwork: Networks.Base,
      fromToken: details(EvmToken.USDC).erc20AddressSourceChain,
      inputAmountDecimal: new Big("17.6"),
      inputAmountRaw: "17600000",
      networkFeeUSD: "0.1",
      outputAmountDecimal: new Big("17.5"),
      outputAmountRaw: outputAmountRaw(outputCurrency),
      toNetwork: Networks.Base,
      toToken: details(outputCurrency).erc20AddressSourceChain
    };
  }
  return {
    blocks,
    globals: {
      fees: { usd: { anchor: "0.06", network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" } },
      partner: null,
      request: request(outputCurrency)
    }
  };
}

describe("EUR Base same-chain transactions", () => {
  for (const outputCurrency of OUTPUTS) {
    it(`preserves transactions, state, precision, and nonce order for Base ${outputCurrency}`, async () => {
      baseBuilderCalls.length = 0;
      const flow =
        outputCurrency === EvmToken.USDC
          ? eurOnrampBaseSameChainFlow
          : makeEurOnrampBaseSameChainSwapFlow(outputCurrency);
      const prepared = await flow.prepareTxs({
        accounts: { [EphemeralAccountType.EVM]: { address: EPHEMERAL, type: EphemeralAccountType.EVM } },
        destinationAddress: DESTINATION,
        metadata: metadata(outputCurrency) as never,
        quote: quote(outputCurrency),
        registrationFacts: {
          mykoboMint: {
            mykoboEmail: "user@example.com",
            mykoboTransactionId: "intent-1",
            mykoboTransactionReference: "EUR-REF-1"
          }
        }
      });

      expect(prepared.unsignedTxs.every(tx => tx.network === Networks.Base && tx.signer === EPHEMERAL)).toBe(true);
      expect(prepared.stateMeta.phaseFlow).toEqual(
        outputCurrency === EvmToken.USDC
          ? [
              "initial",
              "mykoboOnrampDeposit",
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
              "mykoboOnrampDeposit",
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
        mykoboMint: {
          mykoboEmail: "user@example.com",
          mykoboTransactionId: "intent-1",
          mykoboTransactionReference: "EUR-REF-1"
        },
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
      expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.nonce])).toEqual(
        outputCurrency === EvmToken.USDC
          ? [
              ["nablaApprove", 0],
              ["nablaSwap", 1],
              ["distributeFees", 2],
              ["destinationTransfer", 3],
              ["baseCleanupEurc", 4],
              ["baseCleanupUsdc", 5]
            ]
          : [
              ["nablaApprove", 0],
              ["nablaSwap", 1],
              ["distributeFees", 2],
              ["squidRouterApprove", 3],
              ["squidRouterSwap", 4],
              ["destinationTransfer", 5],
              ["baseCleanupEurc", 6],
              ["baseCleanupUsdc", 7]
            ]
      );
      expect(prepared.unsignedTxs.some(tx => tx.phase.startsWith("backup"))).toBe(false);
      expect(prepared.stateMeta.transactionPlan).toEqual({
        nativePrefunding:
          outputCurrency === EvmToken.USDC ? {} : { [`${Networks.Base}:${EPHEMERAL.toLowerCase()}`]: "123" }
      });
      expect(prepared.unsignedTxs.find(tx => tx.phase === "destinationTransfer")?.txData).toMatchObject({
        gas: outputCurrency === EvmToken.ETH ? "21000" : "100000",
        value: outputCurrency === EvmToken.ETH ? outputAmountRaw(outputCurrency) : "0"
      });
      expect(baseBuilderCalls).toEqual(outputCurrency === EvmToken.USDC ? [] : [outputCurrency]);
    });
  }
});
