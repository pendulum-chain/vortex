import { afterAll, describe, expect, it, mock } from "bun:test";
// Captured before mock.module so afterAll can restore the real modules —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, EvmToken, FiatToken, Networks, RampDirection, UnsignedTx } from "@vortexfi/shared";
import * as evmFundingNamespace from "../../../phases/evm-funding";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

const sharedReal = { ...sharedNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const partnerPricingReal = { ...partnerPricingNamespace };

const EVM_EPHEMERAL_ADDRESS = "0x3434343434343434343434343434343434343434";
const DESTINATION_ADDRESS = "0x1212121212121212121212121212121212121212";
const FUNDING_ADDRESS = "0x9999999999999999999999999999999999999999";
const VORTEX_PAYOUT_ADDRESS = "0x8888888888888888888888888888888888888888";

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createNablaTransactionsForOnrampOnEVM: async () => ({ approve: "0xnablaapprove", swap: "0xnablaswap" }),
  createOnrampSquidrouterTransactionsFromBaseToEvm: async () => ({
    approveData: { data: "0xa1", gas: "100000", to: "0xf1", value: "0" },
    squidRouterQuoteId: "squid-quote-id",
    squidRouterReceiverHash: "0xreceiverhash",
    squidRouterReceiverId: "receiver-id",
    swapData: { data: "0xa2", gas: "500000", to: "0xf1", value: "0" }
  }),
  createOnrampSquidrouterTransactionsOnDestinationChain: async () => ({
    approveData: { data: "0xb1", gas: "100000", to: "0xf2", value: "0" },
    swapData: { data: "0xb2", gas: "500000", to: "0xf2", value: "0" }
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
    const blocks = await flow.prepareTxs({
      destinationAddress: DESTINATION_ADDRESS,
      evmEphemeral: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM },
      quote: buildQuote(),
      taxId: "tax-123"
    });

    expect(sortTxs(blocks.unsignedTxs)).toEqual(sortTxs(production.unsignedTxs));
    expect(blocks.stateMeta).toEqual(production.stateMeta);
  });

  it("allocates the production nonce lanes per network", async () => {
    const flow = makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
    const { unsignedTxs } = await flow.prepareTxs({
      destinationAddress: DESTINATION_ADDRESS,
      evmEphemeral: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM },
      quote: buildQuote(),
      taxId: "tax-123"
    });

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
});
