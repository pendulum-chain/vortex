import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, MykoboCurrency, MykoboTransactionType } from "@vortexfi/shared";
import * as customerNamespace from "../../../mykobo/mykobo-customer.service";

const sharedReal = { ...sharedNamespace };
const customerReal = { ...customerNamespace };
const createTransactionIntent = mock(async () => ({
  instructions: { bank_account_name: "Mykobo Europe", iban: "DE89370400440532013000" },
  transaction: { id: "intent-1", reference: "EUR-REF-1" }
}));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  MykoboApiService: { getInstance: () => ({ createTransactionIntent }) }
}));
mock.module("../../../mykobo/mykobo-customer.service", () => ({
  resolveMykoboCustomerForUser: async () => ({ email: "verified@example.com" })
}));

const { registerMykoboMint } = await import("../phases/mykobo-mint/registration");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../mykobo/mykobo-customer.service", () => ({ ...customerReal }));
});

describe("MykoboMint registration", () => {
  it("derives the authenticated customer, creates the deposit intent, and returns owned facts and IBAN artifacts", async () => {
    const result = await registerMykoboMint({
      authenticatedUser: { id: "user-1" },
      input: { email: "verified@example.com" },
      ipAddress: "203.0.113.4",
      metadata: {} as never,
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
    expect(result.facts).toEqual({
      mykoboEmail: "verified@example.com",
      mykoboTransactionId: "intent-1",
      mykoboTransactionReference: "EUR-REF-1"
    });
    expect(result.responseArtifacts).toEqual({
      ibanPaymentData: {
        bic: "",
        iban: "DE89370400440532013000",
        receiverName: "Mykobo Europe",
        reference: "EUR-REF-1"
      }
    });
  });
});
