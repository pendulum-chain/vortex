import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

const sharedReal = { ...sharedNamespace };
const EPHEMERAL = "0x3434343434343434343434343434343434343434";
const DESTINATION = "0x1212121212121212121212121212121212121212";
const REQUEST = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.Base,
  outputCurrency: EvmToken.EURC,
  rampType: RampDirection.BUY,
  to: Networks.Base
};

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({ estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n }) })
    })
  }
}));

const { prepareMykoboToEvmOnrampTransactions } = await import("../../../transactions/onramp/routes/mykobo-to-evm");
const { eurOnrampBaseDirectFlow } = await import("../flows/eur-onramp-base-direct");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

function quote(): QuoteTicketAttributes {
  return {
    ...REQUEST,
    id: "quote-eur-direct",
    metadata: { mykoboMint: { outputAmountRaw: "99940000" } },
    outputAmount: "99.94",
    partnerId: null,
    pricingPartnerId: null
  } as unknown as QuoteTicketAttributes;
}

describe("EUR_ONRAMP_BASE_DIRECT transaction parity", () => {
  it("matches the legacy nonce-zero transfer with no cleanup and preserves owned state", async () => {
    const legacy = await prepareMykoboToEvmOnrampTransactions({
      destinationAddress: DESTINATION,
      ipAddress: "203.0.113.4",
      mykoboEmail: "user@example.com",
      mykoboTransactionId: "intent-direct",
      mykoboTransactionReference: "EUR-DIRECT-1",
      quote: quote(),
      signingAccounts: [{ address: EPHEMERAL, type: EphemeralAccountType.EVM }]
    });
    const prepared = await eurOnrampBaseDirectFlow.prepareTxs({
      accounts: { [EphemeralAccountType.EVM]: { address: EPHEMERAL, type: EphemeralAccountType.EVM } },
      destinationAddress: DESTINATION,
      metadata: {
        blocks: {
          destinationTransfer: {
            amountDecimal: new Big("99.94"),
            amountRaw: "99940000",
            network: Networks.Base,
            token: EvmToken.EURC
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
          }
        },
        globals: {
          fees: { usd: { anchor: "0.06", network: "0", partnerMarkup: "0", total: "0.16", vortex: "0.1" } },
          partner: null,
          request: REQUEST
        }
      },
      quote: quote(),
      registrationFacts: {
        mykoboMint: {
          mykoboEmail: "user@example.com",
          mykoboTransactionId: "intent-direct",
          mykoboTransactionReference: "EUR-DIRECT-1"
        }
      }
    });

    expect(prepared.unsignedTxs).toEqual(legacy.unsignedTxs);
    expect(prepared.unsignedTxs.map(tx => [tx.phase, tx.network, tx.nonce])).toEqual([
      ["destinationTransfer", Networks.Base, 0]
    ]);
    expect(prepared.stateMeta).toEqual({
      accountAddresses: { EVM: EPHEMERAL },
      blockState: {
        mykoboMint: {
          mykoboEmail: "user@example.com",
          mykoboTransactionId: "intent-direct",
          mykoboTransactionReference: "EUR-DIRECT-1"
        }
      },
      destinationAddress: DESTINATION,
      evmEphemeralAddress: EPHEMERAL,
      isDirectTransfer: true,
      phaseFlow: legacy.stateMeta.phaseFlow as typeof prepared.stateMeta.phaseFlow,
      transactionPlan: { nativePrefunding: {} }
    });
  });
});
