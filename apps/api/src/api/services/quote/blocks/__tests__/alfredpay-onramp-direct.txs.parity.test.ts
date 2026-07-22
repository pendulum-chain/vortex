import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  ALFREDPAY_EVM_TOKEN,
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
  EvmTokenDetails,
  FiatToken,
  Networks,
  RampDirection,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { privateKeyToAccount } from "viem/accounts";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import * as evmFundingNamespace from "../../../phases/evm-funding";
import * as alfredpayCustomerNamespace from "../../alfredpay-customer";
import type { FlowMetadata } from "../core/metadata";

const sharedReal = { ...sharedNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const alfredpayCustomerReal = { ...alfredpayCustomerNamespace };
const sourceAmounts: string[] = [];
const EVM_EPHEMERAL_ADDRESS = privateKeyToAccount(
  "0x3434343434343434343434343434343434343434343434343434343434343434"
).address;
const DESTINATION_ADDRESS = "0x1212121212121212121212121212121212121212";
const FUNDING_ADDRESS = "0x9999999999999999999999999999999999999999";

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createOnrampSquidrouterTransactionsFromPolygonToEvm: async ({ rawAmount }: { rawAmount: string }) => {
    sourceAmounts.push(rawAmount);
    return {
      approveData: { data: "0xa1", gas: "100000", to: "0x1111111111111111111111111111111111111111", value: "0" },
      squidRouterQuoteId: "squid-quote-id",
      squidRouterReceiverHash: "0xreceiverhash",
      squidRouterReceiverId: "receiver-id",
      swapData: { data: "0xa2", gas: "500000", to: "0x1111111111111111111111111111111111111111", value: "123" }
    };
  },
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n })
      })
    })
  }
}));

mock.module("../../../phases/evm-funding", () => ({
  getEvmFundingAccount: () => ({ address: FUNDING_ADDRESS })
}));

mock.module("../../alfredpay-customer", () => ({
  resolveAlfredpayCustomerId: async () => "alfredpay-user-id"
}));

const { prepareAlfredpayToEvmOnrampTransactions } = await import("../../../transactions/onramp/routes/alfredpay-to-evm");
const { makeAlfredpayOnrampDirectFlow } = await import("../flows/alfredpay-onramp-direct");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../phases/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../alfredpay-customer", () => ({ ...alfredpayCustomerReal }));
});

function buildQuote(outputCurrency: EvmToken): QuoteTicketAttributes {
  const outputAmount = outputCurrency === ALFREDPAY_EVM_TOKEN ? "96" : "95";
  return {
    from: EPaymentMethod.SPEI,
    id: "quote-alfredpay-direct",
    inputAmount: "100",
    inputCurrency: FiatToken.MXN,
    metadata: {
      alfredpayMint: { outputAmountRaw: "98000000" },
      evmToEvm: { inputAmountRaw: "96000000", outputAmountRaw: `${outputAmount}000000` }
    },
    network: Networks.Polygon,
    outputAmount,
    outputCurrency,
    partnerId: null,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    to: Networks.Polygon
  } as unknown as QuoteTicketAttributes;
}

function buildMetadata(outputCurrency: EvmToken): FlowMetadata {
  const outputAmount = outputCurrency === ALFREDPAY_EVM_TOKEN ? "96" : "95";
  const tokenDetails = sharedReal.getOnChainTokenDetails(Networks.Polygon, outputCurrency) as EvmTokenDetails;
  return {
    blocks: {
      alfredpayMint: {
        currency: FiatToken.MXN,
        expirationDate: new Date(),
        fee: new Big(2),
        inputAmountDecimal: new Big(100),
        inputAmountRaw: "10000",
        outputAmountDecimal: new Big(98),
        outputAmountRaw: "98000000",
        quoteId: "alfred-quote"
      },
      destinationTransfer: {
        amountDecimal: new Big(outputAmount),
        amountRaw: `${outputAmount}000000`,
        network: Networks.Polygon,
        token: outputCurrency
      },
      finalSettlementSubsidy: {},
      fundEphemeral: { network: Networks.Polygon, token: ALFREDPAY_EVM_TOKEN },
      squidRouterSwap: {
        fromNetwork: Networks.Polygon,
        fromToken: sharedReal.ALFREDPAY_ERC20_TOKEN,
        inputAmountDecimal: new Big(96),
        inputAmountRaw: "96000000",
        networkFeeUSD: outputCurrency === ALFREDPAY_EVM_TOKEN ? "0" : "1",
        outputAmountDecimal: new Big(outputAmount),
        outputAmountRaw: `${outputAmount}000000`,
        toNetwork: Networks.Polygon,
        toToken: tokenDetails.erc20AddressSourceChain
      },
      subsidizePreSwap: {
        expectedOutputAmountDecimal: new Big(98),
        expectedOutputAmountRaw: "98000000",
        inputCurrency: ALFREDPAY_EVM_TOKEN,
        inputDecimals: 6,
        network: Networks.Polygon,
        targetInputAmountRaw: "96000000"
      }
    },
    globals: {
      fees: { usd: { anchor: "2", network: "0", partnerMarkup: "1", total: "4", vortex: "1" } },
      partner: { id: null },
      request: {
        from: EPaymentMethod.SPEI,
        inputAmount: "100",
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency,
        rampType: RampDirection.BUY,
        to: Networks.Polygon
      }
    }
  };
}

const sortKey = (tx: UnsignedTx) => `${tx.network}|${tx.signer}|${tx.phase}|${tx.nonce}`;
const sortTxs = (txs: UnsignedTx[]) => [...txs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

describe("ALFREDPAY_ONRAMP_DIRECT transaction parity", () => {
  for (const outputCurrency of [ALFREDPAY_EVM_TOKEN, EvmToken.USDC]) {
    it(`matches production for Polygon ${outputCurrency}`, async () => {
      sourceAmounts.length = 0;
      const production = await prepareAlfredpayToEvmOnrampTransactions({
        destinationAddress: DESTINATION_ADDRESS,
        quote: buildQuote(outputCurrency),
        signingAccounts: [{ address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM }],
        userId: "user-id"
      });
      const { metadata: _metadata, ...quote } = buildQuote(outputCurrency);
      const blocks = await makeAlfredpayOnrampDirectFlow(outputCurrency).prepareTxs({
        destinationAddress: DESTINATION_ADDRESS,
        accounts: { [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM } },
        metadata: buildMetadata(outputCurrency) as never,
        quote,
        userId: "user-id"
      });

      expect(sortTxs(blocks.unsignedTxs)).toEqual(sortTxs(production.unsignedTxs));
      expect(blocks.stateMeta.phaseFlow).toEqual(production.stateMeta.phaseFlow as typeof blocks.stateMeta.phaseFlow);
      expect(blocks.stateMeta.isDirectTransfer).toBe(production.stateMeta.isDirectTransfer as boolean | undefined);
      expect(blocks.stateMeta.blockState).toEqual(
        outputCurrency === ALFREDPAY_EVM_TOKEN
          ? { alfredpayMint: { userId: "alfredpay-user-id" } }
          : {
              alfredpayMint: { userId: "alfredpay-user-id" },
              squidRouterSwap: {
                quoteId: production.stateMeta.squidRouterQuoteId,
                receiverHash: production.stateMeta.squidRouterReceiverHash,
                receiverId: production.stateMeta.squidRouterReceiverId
              }
            }
      );
      expect(blocks.stateMeta.transactionPlan).toEqual({
        nativePrefunding:
          outputCurrency === ALFREDPAY_EVM_TOKEN
            ? {}
            : { [`${Networks.Polygon}:${EVM_EPHEMERAL_ADDRESS.toLowerCase()}`]: "123" }
      });
      expect(sourceAmounts).toEqual(outputCurrency === ALFREDPAY_EVM_TOKEN ? [] : ["96000000", "96000000"]);
      expect(blocks.unsignedTxs.map(tx => [tx.phase, tx.nonce])).toEqual(
        outputCurrency === ALFREDPAY_EVM_TOKEN
          ? [
              ["destinationTransfer", 0],
              ["polygonCleanup", 1]
            ]
          : [
              ["squidRouterApprove", 0],
              ["squidRouterSwap", 1],
              ["destinationTransfer", 2],
              ["polygonCleanup", 3]
            ]
      );
    });
  }
});
