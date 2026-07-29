import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import type { FlowMetadata } from "../core/metadata";

const sharedReal = { ...sharedNamespace };
const EVM_EPHEMERAL_ADDRESS = "0x3434343434343434343434343434343434343434";
const DESTINATION_ADDRESS = "0x1212121212121212121212121212121212121212";
const REQUEST = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  outputCurrency: EvmToken.BRLA,
  rampType: RampDirection.BUY,
  to: Networks.Base
};

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n })
      })
    })
  }
}));

const { brlOnrampBaseDirectFlow } = await import("../flows/brl-onramp-base-direct");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

function buildQuote(): QuoteTicketAttributes {
  return {
    from: EPaymentMethod.PIX,
    id: "quote-direct",
    inputAmount: "100",
    inputCurrency: FiatToken.BRL,
    metadata: {},
    network: Networks.Base,
    outputAmount: "98.3",
    outputCurrency: EvmToken.BRLA,
    partnerId: null,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    to: Networks.Base
  } as unknown as QuoteTicketAttributes;
}

type DirectBlockMetadata = Awaited<ReturnType<typeof brlOnrampBaseDirectFlow.simulate>>["metadata"]["blocks"];

function buildMetadata(): FlowMetadata<DirectBlockMetadata> {
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
        amountDecimal: new Big("98.3"),
        amountRaw: "98300000000000000000",
        network: Networks.Base,
        token: EvmToken.BRLA
      },
      fundEphemeral: { network: Networks.Base, token: EvmToken.BRLA }
    },
    globals: {
      fees: { usd: { anchor: "0.27", network: "0", partnerMarkup: "0", total: "0.324", vortex: "0.054" } },
      partner: null,
      request: REQUEST
    }
  };
}

describe("BRL onramp Base direct transactions", () => {
  it("prepares the direct transfer and preserves phase-local state", async () => {
    const quote = buildQuote();
    const blocks = await brlOnrampBaseDirectFlow.prepareTxs({
      destinationAddress: DESTINATION_ADDRESS,
      accounts: { [EphemeralAccountType.EVM]: { address: EVM_EPHEMERAL_ADDRESS, type: EphemeralAccountType.EVM } },
      metadata: buildMetadata(),
      quote: quote as never,
      registrationFacts: { aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" } }
    });
    expect(blocks.unsignedTxs.map(tx => [tx.phase, tx.network, tx.signer, tx.nonce])).toEqual([
      ["destinationTransfer", Networks.Base, EVM_EPHEMERAL_ADDRESS, 0]
    ]);
    expect(blocks.unsignedTxs[0].txData).toMatchObject({ gas: "100000", value: "0" });
    expect(blocks.stateMeta).toEqual({
      accountAddresses: { [EphemeralAccountType.EVM]: EVM_EPHEMERAL_ADDRESS },
      blockState: { aveniaMint: { aveniaTicketId: "ticket-123", taxId: "tax-123" } },
      destinationAddress: DESTINATION_ADDRESS,
      evmEphemeralAddress: EVM_EPHEMERAL_ADDRESS,
      isDirectTransfer: true,
      phaseFlow: ["initial", "brlaOnrampMint", "fundEphemeral", "destinationTransfer", "complete"],
      transactionPlan: { nativePrefunding: {} }
    });
  });
});
