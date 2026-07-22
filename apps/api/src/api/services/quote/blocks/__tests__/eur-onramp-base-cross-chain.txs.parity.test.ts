import { afterAll, describe, expect, it, mock } from "bun:test";
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
import Big from "big.js";
import { privateKeyToAccount } from "viem/accounts";
import * as evmFundingNamespace from "../../../phases/evm-funding";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

const sharedReal = { ...sharedNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const partnerPricingReal = { ...partnerPricingNamespace };
const PRIVATE_KEY = "0x3434343434343434343434343434343434343434343434343434343434343434";
const EPHEMERAL = privateKeyToAccount(PRIVATE_KEY).address;
const DESTINATION = "0x1212121212121212121212121212121212121212";
const FUNDING = "0x9999999999999999999999999999999999999999";

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
      getClient: () => ({ estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n }) })
    })
  },
  getNablaBasePool: () => ({ router: "0x4444444444444444444444444444444444444444" })
}));
mock.module("../../../phases/evm-funding", () => ({ getEvmFundingAccount: () => ({ address: FUNDING }) }));
mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async () => ({ payoutAddressEvm: "0x8888888888888888888888888888888888888888" })
}));

const { prepareMykoboToEvmOnrampTransactions } = await import("../../../transactions/onramp/routes/mykobo-to-evm");
const { makeEurOnrampBaseCrossChainFlow } = await import("../flows/eur-onramp-base-cross-chain");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../phases/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

const REQUEST = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.Arbitrum,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Arbitrum
};

function quote(): QuoteTicketAttributes {
  return {
    from: EPaymentMethod.SEPA,
    id: "quote-eur",
    inputAmount: "100",
    inputCurrency: FiatToken.EURC,
    metadata: {
      evmToEvm: { inputAmountRaw: "107000000" },
      fees: { usd: { anchor: "0.06", network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" } },
      mykoboMint: { outputAmountRaw: "99940000" },
      nablaSwapEvm: { inputAmountForSwapRaw: "99940000", outputAmountRaw: "108000000" }
    },
    network: Networks.Arbitrum,
    outputAmount: "106.5",
    outputCurrency: EvmToken.USDC,
    partnerId: null,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    to: Networks.Arbitrum
  } as unknown as QuoteTicketAttributes;
}

function metadata() {
  const subsidy = {
    actualOutputAmountDecimal: new Big("106.5"),
    actualOutputAmountRaw: "106500000",
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    applied: false,
    expectedOutputAmountDecimal: new Big("106.5"),
    expectedOutputAmountRaw: "106500000",
    idealSubsidyAmountInOutputTokenDecimal: new Big(0),
    idealSubsidyAmountInOutputTokenRaw: "0",
    partnerId: null,
    subsidyAmountInOutputTokenDecimal: new Big(0),
    subsidyAmountInOutputTokenRaw: "0",
    subsidyRate: new Big(0),
    targetOutputAmountDecimal: new Big("106.5"),
    targetOutputAmountRaw: "106500000"
  };
  return {
    blocks: {
      destinationTransfer: { amountDecimal: new Big("106.5"), amountRaw: "106500000", network: Networks.Arbitrum, token: EvmToken.USDC },
      distributeFees: { anchorFeeUsd: "0.06", networkFeeUsd: "0.1", partnerMarkupUsd: "0", totalFeesUsd: "0.2", vortexFeeUsd: "0.1" },
      finalSettlementSubsidy: { ...subsidy, amountRaw: "106500000", network: Networks.Arbitrum, token: EvmToken.USDC },
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
        inputAmountForSwapDecimal: "99.94",
        inputAmountForSwapRaw: "99940000",
        inputCurrency: EvmToken.EURC,
        inputDecimals: 6,
        inputToken: "0x1111111111111111111111111111111111111111",
        outputAmountDecimal: new Big(108),
        outputAmountRaw: "108000000",
        outputCurrency: EvmToken.USDC,
        outputDecimals: 6,
        outputToken: "0x2222222222222222222222222222222222222222"
      },
      squidRouterSwap: {
        fromNetwork: Networks.Base,
        fromToken: "0x2222222222222222222222222222222222222222",
        inputAmountDecimal: new Big(107),
        inputAmountRaw: "107000000",
        networkFeeUSD: "0.1",
        outputAmountDecimal: new Big("106.5"),
        outputAmountRaw: "106500000",
        toNetwork: Networks.Arbitrum,
        toToken: "0x3333333333333333333333333333333333333333"
      },
      subsidizePostSwap: { ...subsidy, outputCurrency: EvmToken.USDC, outputDecimals: 6 },
      subsidizePreSwap: {
        expectedOutputAmountDecimal: new Big(108),
        expectedOutputAmountRaw: "108000000",
        inputCurrency: EvmToken.EURC,
        inputDecimals: 6,
        network: Networks.Base,
        targetInputAmountRaw: "99940000"
      }
    },
    globals: {
      fees: { usd: { anchor: "0.06", network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" } },
      partner: null,
      request: REQUEST
    }
  } as never;
}

const sortTxs = (txs: UnsignedTx[]) =>
  [...txs].sort((a, b) => `${a.network}|${a.phase}|${a.nonce}`.localeCompare(`${b.network}|${b.phase}|${b.nonce}`));

describe("EUR_ONRAMP_BASE_CROSS_CHAIN transaction parity", () => {
  it("matches legacy unsigned transactions, nonce lanes, cleanup, and owned state", async () => {
    const legacy = await prepareMykoboToEvmOnrampTransactions({
      destinationAddress: DESTINATION,
      ipAddress: "203.0.113.4",
      mykoboEmail: "user@example.com",
      mykoboTransactionId: "intent-1",
      mykoboTransactionReference: "EUR-REF-1",
      quote: quote(),
      signingAccounts: [{ address: EPHEMERAL, type: EphemeralAccountType.EVM }]
    });
    const flow = makeEurOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
    const prepared = await flow.prepareTxs({
      accounts: { [EphemeralAccountType.EVM]: { address: EPHEMERAL, type: EphemeralAccountType.EVM } },
      destinationAddress: DESTINATION,
      metadata: metadata(),
      quote: quote(),
      registrationFacts: {
        mykoboMint: {
          mykoboEmail: "user@example.com",
          mykoboTransactionId: "intent-1",
          mykoboTransactionReference: "EUR-REF-1"
        }
      }
    });

    expect(sortTxs(prepared.unsignedTxs)).toEqual(sortTxs(legacy.unsignedTxs));
    const evmEphemeral = { address: EPHEMERAL, secret: PRIVATE_KEY, type: EphemeralAccountType.EVM };
    const [legacySigned, blockSigned] = await Promise.all([
      signUnsignedTransactions(legacy.unsignedTxs, { evmEphemeral }),
      signUnsignedTransactions(prepared.unsignedTxs, { evmEphemeral })
    ]);
    expect(sortTxs(blockSigned)).toEqual(sortTxs(legacySigned));
    expect(prepared.stateMeta.phaseFlow).toEqual(legacy.stateMeta.phaseFlow as typeof prepared.stateMeta.phaseFlow);
    expect(prepared.stateMeta.blockState).toEqual({
      mykoboMint: {
        mykoboEmail: "user@example.com",
        mykoboTransactionId: "intent-1",
        mykoboTransactionReference: "EUR-REF-1"
      },
      nablaSwap: { softMinimumOutputRaw: legacy.stateMeta.nablaSoftMinimumOutputRaw },
      squidRouterSwap: {
        quoteId: legacy.stateMeta.squidRouterQuoteId,
        receiverHash: legacy.stateMeta.squidRouterReceiverHash,
        receiverId: legacy.stateMeta.squidRouterReceiverId
      }
    });
    expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.network, tx.nonce])).toEqual(
      expect.arrayContaining([
        ["nablaApprove", Networks.Base, 0],
        ["nablaSwap", Networks.Base, 1],
        ["distributeFees", Networks.Base, 2],
        ["squidRouterApprove", Networks.Base, 3],
        ["squidRouterSwap", Networks.Base, 4],
        ["baseCleanupEurc", Networks.Base, 5],
        ["baseCleanupUsdc", Networks.Base, 6],
        ["destinationTransfer", Networks.Arbitrum, 0],
        ["backupSquidRouterApprove", Networks.Arbitrum, 1],
        ["backupSquidRouterSwap", Networks.Arbitrum, 2],
        ["backupApprove", Networks.Arbitrum, 0]
      ])
    );
    expect(prepared.stateMeta.transactionPlan).toEqual({
      nativePrefunding: { [`${Networks.Base}:${EPHEMERAL.toLowerCase()}`]: "123" }
    });
  }, 60_000);
});
