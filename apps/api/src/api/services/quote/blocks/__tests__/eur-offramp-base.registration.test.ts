import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, MykoboCurrency, MykoboTransactionType } from "@vortexfi/shared";
import * as customerNamespace from "../../../mykobo/mykobo-customer.service";

const sharedReal = { ...sharedNamespace };
const customerReal = { ...customerNamespace };
const resolveCustomer = mock(async (_userId: string, providedEmail?: string) => {
  if (providedEmail === "wrong@example.com") throw new Error("email mismatch");
  return { email: "verified@example.com" };
});
const createTransactionIntent = mock(async () => ({
  instructions: { address: "0x3434343434343434343434343434343434343434" },
  transaction: { id: "withdraw-1", reference: "EUR-WITHDRAW-1" }
}));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  MykoboApiService: { getInstance: () => ({ createTransactionIntent }) }
}));
mock.module("../../../mykobo/mykobo-customer.service", () => ({ resolveMykoboCustomerForUser: resolveCustomer }));

const { registerMykoboOfframpPayout } = await import("../phases/mykobo-offramp-payout/registration");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../mykobo/mykobo-customer.service", () => ({ ...customerReal }));
});

function context(ipAddress?: string, email = "verified@example.com") {
  return {
    authenticatedUser: { id: "user-1" },
    input: { email },
    ipAddress,
    metadata: {
      payoutAmountDecimal: "98.63",
      payoutAmountRaw: "9863",
      transferAmountDecimal: "98.98",
      transferAmountRaw: "98980000"
    },
    quote: {} as never,
    signingAccounts: [{ address: "0x1212121212121212121212121212121212121212", type: EphemeralAccountType.EVM }]
  };
}

describe("EUR offramp Mykobo registration trust boundary", () => {
  it("derives identity and provider receivables before exposing typed facts", async () => {
    const result = await registerMykoboOfframpPayout(context("203.0.113.4"));
    expect(resolveCustomer).toHaveBeenCalledWith("user-1", "verified@example.com");
    expect(createTransactionIntent).toHaveBeenCalledWith({
      currency: MykoboCurrency.EURC,
      email_address: "verified@example.com",
      ip_address: "203.0.113.4",
      transaction_type: MykoboTransactionType.WITHDRAW,
      value: "98.98",
      wallet_address: "0x1212121212121212121212121212121212121212"
    });
    expect(result.facts).toEqual({
      mykoboEmail: "verified@example.com",
      mykoboReceivablesAddress: "0x3434343434343434343434343434343434343434",
      mykoboTransactionId: "withdraw-1",
      mykoboTransactionReference: "EUR-WITHDRAW-1"
    });
  });

  it("rejects missing IP before identity or provider side effects", async () => {
    resolveCustomer.mockClear();
    createTransactionIntent.mockClear();
    await expect(registerMykoboOfframpPayout(context())).rejects.toThrow("IP address");
    expect(resolveCustomer).not.toHaveBeenCalled();
    expect(createTransactionIntent).not.toHaveBeenCalled();
  });

  it("rejects a mismatched supplied email before intent creation", async () => {
    createTransactionIntent.mockClear();
    await expect(registerMykoboOfframpPayout(context("203.0.113.4", "wrong@example.com"))).rejects.toThrow("email mismatch");
    expect(createTransactionIntent).not.toHaveBeenCalled();
  });

  it("rejects provider responses that do not contain withdrawal instructions", async () => {
    createTransactionIntent.mockImplementationOnce(
      (async () => ({
        instructions: { bank_account_name: "Not withdrawal instructions", iban: "DE89370400440532013000" },
        transaction: { id: "withdraw-invalid", reference: "EUR-INVALID-1" }
      })) as never
    );
    await expect(registerMykoboOfframpPayout(context("203.0.113.4"))).rejects.toThrow("receivables instructions");
  });
});
