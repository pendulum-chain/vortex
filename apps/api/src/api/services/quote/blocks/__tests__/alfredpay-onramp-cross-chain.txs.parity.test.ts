import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  EphemeralAccountType,
  EPaymentMethod,
  EvmToken,
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
const destinationAmounts: string[] = [];
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
  createOnrampSquidrouterTransactionsOnDestinationChain: async ({ rawAmount }: { rawAmount: string }) => {
    destinationAmounts.push(rawAmount);
    return {
      approveData: { data: "0xb1", gas: "100000", to: "0x2222222222222222222222222222222222222222", value: "0" },
      swapData: { data: "0xb2", gas: "500000", to: "0x2222222222222222222222222222222222222222", value: "0" }
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
const { makeAlfredpayOnrampCrossChainFlow } = await import("../flows/alfredpay-onramp-cross-chain");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../phases/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../alfredpay-customer", () => ({ ...alfredpayCustomerReal }));
});

function buildQuote(): QuoteTicketAttributes {
  return {
    from: EPaymentMethod.SPEI,
    id: "quote-alfredpay",
    inputAmount: "100",
    inputCurrency: FiatToken.MXN,
    metadata: {
      alfredpayMint: { outputAmountRaw: "98000000" },
      evmToEvm: { inputAmountRaw: "96000000", outputAmountRaw: "95000000" }
    },
    network: Networks.Arbitrum,
    outputAmount: "95",
    outputCurrency: EvmToken.USDC,
    partnerId: null,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    to: Networks.Arbitrum
  } as unknown as QuoteTicketAttributes;
}

function buildMetadata(): FlowMetadata {
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
        amountDecimal: new Big(95),
        amountRaw: "95000000",
        network: Networks.Arbitrum,
        token: EvmToken.USDC
      },
      finalSettlementSubsidy: {},
      fundEphemeral: { network: Networks.Polygon, token: EvmToken.USDT },
      squidRouterSwap: {
        fromNetwork: Networks.Polygon,
        fromToken: sharedReal.ALFREDPAY_ERC20_TOKEN,
        inputAmountDecimal: new Big(96),
        inputAmountRaw: "96000000",
        networkFeeUSD: "1",
        outputAmountDecimal: new Big(95),
        outputAmountRaw: "95000000",
        toNetwork: Networks.Arbitrum,
        toToken: sharedReal.evmTokenConfig.arbitrum.USDC!.erc20AddressSourceChain
      },
      subsidizePreSwap: {
        expectedOutputAmountDecimal: new Big(98),
        expectedOutputAmountRaw: "98000000",
        inputCurrency: EvmToken.USDT,
        inputDecimals: 6,
        network: Networks.Polygon,
        targetInputAmountRaw: "96000000"
      }
    },
    globals: {
      fees: {
        usd: { anchor: "2", network: "0", partnerMarkup: "1", total: "4", vortex: "1" }
      },
      partner: { id: null },
      request: {
        from: EPaymentMethod.SPEI,
        inputAmount: "100",
        inputCurrency: FiatToken.MXN,
        network: Networks.Arbitrum,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Arbitrum
      }
    }
  };
}

const sortKey = (tx: UnsignedTx) => `${tx.network}|${tx.signer}|${tx.phase}|${tx.nonce}`;
const sortTxs = (txs: UnsignedTx[]) => [...txs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

describe("ALFREDPAY_ONRAMP_CROSS_CHAIN transaction parity", () => {
  it("matches aligned production transactions and owns route state by block", async () => {
    sourceAmounts.length = 0;
    destinationAmounts.length = 0;
    const production = await prepareAlfredpayToEvmOnrampTransactions({
      destinationAddress: DESTINATION_ADDRESS,
      quote: buildQuote(),
      signingAccounts: [{ address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM }],
      userId: "user-id"
    });
    const { metadata: _metadata, ...quote } = buildQuote();
    const blocks = await makeAlfredpayOnrampCrossChainFlow(Networks.Arbitrum, EvmToken.USDC).prepareTxs({
      destinationAddress: DESTINATION_ADDRESS,
      evmEphemeral: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM },
      metadata: buildMetadata() as never,
      quote,
      userId: "user-id"
    });

    expect(sourceAmounts).toEqual(["96000000", "96000000"]);
    expect(destinationAmounts).toEqual(["96000000", "96000000"]);
    expect(sortTxs(blocks.unsignedTxs)).toEqual(sortTxs(production.unsignedTxs));
    expect(blocks.stateMeta.blockState).toEqual({
      alfredpayMint: { userId: "alfredpay-user-id" },
      squidRouterSwap: {
        quoteId: production.stateMeta.squidRouterQuoteId,
        receiverHash: production.stateMeta.squidRouterReceiverHash,
        receiverId: production.stateMeta.squidRouterReceiverId
      }
    });
    expect(blocks.stateMeta.phaseFlow).toEqual(production.stateMeta.phaseFlow as typeof blocks.stateMeta.phaseFlow);
    expect(blocks.stateMeta.transactionPlan).toEqual({
      nativePrefunding: { [`${Networks.Polygon}:${EVM_EPHEMERAL_ADDRESS.toLowerCase()}`]: "123" }
    });
  });
});
