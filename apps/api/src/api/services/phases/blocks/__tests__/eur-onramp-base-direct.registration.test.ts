import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, EPaymentMethod, EvmToken, FiatToken, MykoboCurrency, MykoboTransactionType, Networks, RampDirection } from "@vortexfi/shared";
import * as customerNamespace from "../../../mykobo/mykobo-customer.service";

const sharedReal = { ...sharedNamespace };
const customerReal = { ...customerNamespace };
const createTransactionIntent = mock(async () => ({
  instructions: { bank_account_name: "Mykobo Europe", iban: "DE89370400440532013000" },
  transaction: { id: "intent-direct", reference: "EUR-DIRECT-1" }
}));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  MykoboApiService: { getInstance: () => ({ createTransactionIntent }) }
}));
mock.module("../../../mykobo/mykobo-customer.service", () => ({
  resolveMykoboCustomerForUser: async () => ({ email: "verified@example.com" })
}));

const { eurOnrampBaseDirectFlow } = await import("../flows/eur-onramp-base-direct");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../mykobo/mykobo-customer.service", () => ({ ...customerReal }));
});

describe("EUR_ONRAMP_BASE_DIRECT registration", () => {
  it("registers through MykoboMint and returns phase-owned facts and payment artifacts", async () => {
    const registered = await eurOnrampBaseDirectFlow.register({
      authenticatedUser: { id: "user-1" },
      input: { email: "verified@example.com" },
      ipAddress: "203.0.113.4",
      metadata: {
        blocks: {
          destinationTransfer: {} as never,
          fundEphemeral: {} as never,
          mykoboMint: {} as never
        },
        globals: {
          fees: { usd: { anchor: "0.06", network: "0", partnerMarkup: "0", total: "0.16", vortex: "0.1" } },
          partner: null,
          request: {
            from: EPaymentMethod.SEPA,
            inputAmount: "100.129",
            inputCurrency: FiatToken.EURC,
            network: Networks.Base,
            outputCurrency: EvmToken.EURC,
            rampType: RampDirection.BUY,
            to: Networks.Base
          }
        }
      },
      quote: { inputAmount: "100.129" } as never,
      signingAccounts: [{ address: "0x1212121212121212121212121212121212121212", type: EphemeralAccountType.EVM }]
    });

    expect(createTransactionIntent).toHaveBeenCalledWith({
      currency: MykoboCurrency.EURC,
      email_address: "verified@example.com",
      ip_address: "203.0.113.4",
      transaction_type: MykoboTransactionType.DEPOSIT,
      value: "100.12",
      wallet_address: "0x1212121212121212121212121212121212121212"
    });
    expect(registered.registrationFacts).toEqual({
      mykoboMint: {
        mykoboEmail: "verified@example.com",
        mykoboTransactionId: "intent-direct",
        mykoboTransactionReference: "EUR-DIRECT-1"
      }
    });
    expect(registered.responseArtifacts).toEqual({
      mykoboMint: {
        ibanPaymentData: {
          bic: "",
          iban: "DE89370400440532013000",
          receiverName: "Mykobo Europe",
          reference: "EUR-DIRECT-1"
        }
      }
    });
  });
});
