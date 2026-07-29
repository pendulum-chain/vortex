import { describe, expect, it, mock } from "bun:test";
import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayPaymentMethodType,
  FiatToken
} from "@vortexfi/shared";
import Big from "big.js";
import { startAlfredpayMint } from "../phases/alfredpay-mint/lifecycle";
import type { AlfredpayMintMetadata } from "../phases/alfredpay-mint/simulation";

const metadata: AlfredpayMintMetadata = {
  currency: FiatToken.MXN,
  expirationDate: new Date("2026-01-01T00:00:00Z"),
  fee: "1",
  inputAmountDecimal: "100",
  inputAmountRaw: "10000",
  outputAmountDecimal: "99",
  outputAmountRaw: "99000000",
  quoteId: "quote-old"
};

function context(state: Record<string, unknown> = {}) {
  return {
    metadata,
    ownState: { userId: "provider-customer-1" },
    quote: { id: "vortex-quote-1", inputAmount: "100", inputCurrency: FiatToken.MXN } as never,
    state: {
      destinationAddress: "0x1111111111111111111111111111111111111111",
      evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
      ...state
    } as never,
    userId: "user-1"
  };
}

function dependencies(toAmount = "99") {
  const createOnramp = mock(async () => ({
    fiatPaymentInstructions: { clabe: "646180157000000004", paymentType: "SPEI" },
    transaction: { transactionId: "transaction-1" }
  }));
  const createOnrampQuote = mock(async () => ({
    expiration: "2026-01-01T00:01:00Z",
    fees: [{ amount: "1", currency: "MXN" }],
    quoteId: "quote-new",
    toAmount
  }));
  return {
    createOnramp,
    createOnrampQuote,
    dependencies: {
      resolveCustomerId: mock(async () => "provider-customer-1"),
      service: { createOnramp, createOnrampQuote } as never,
      sumFees: () => new Big(1)
    }
  };
}

describe("Alfredpay onramp start lifecycle", () => {
  it("refreshes an exact quote, creates the order, and returns persisted instructions", async () => {
    const { createOnramp, dependencies: injected } = dependencies();
    const result = await startAlfredpayMint(context(), injected);

    expect(createOnramp).toHaveBeenCalledWith({
      amount: "100",
      chain: AlfredpayChain.MATIC,
      customerId: "provider-customer-1",
      depositAddress: "0x2222222222222222222222222222222222222222",
      fromCurrency: AlfredpayFiatCurrency.MXN,
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      quoteId: "quote-new",
      toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
    });
    expect(result.metadata).toEqual({
      ...metadata,
      expirationDate: new Date("2026-01-01T00:01:00Z"),
      quoteId: "quote-new"
    });
    expect(result.state).toEqual({
      alfredpayTransactionId: "transaction-1",
      fiatPaymentInstructions: { clabe: "646180157000000004", paymentType: "SPEI" }
    });
    expect(result.responseArtifacts).toEqual({
      achPaymentData: { clabe: "646180157000000004", paymentType: "SPEI" }
    });
  });

  it("falls back to the original quote when refreshed economics drift", async () => {
    const { createOnramp, dependencies: injected } = dependencies("98");
    const result = await startAlfredpayMint(context(), injected);

    expect(createOnramp).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "quote-old" }));
    expect(result.metadata).toBeUndefined();
    expect(result.state?.alfredpayTransactionId).toBe("transaction-1");
  });

  it("does not refresh or create another order after the transaction is persisted", async () => {
    const { createOnramp, createOnrampQuote, dependencies: injected } = dependencies();
    const result = await startAlfredpayMint(context({ alfredpayTransactionId: "transaction-existing" }), injected);

    expect(result).toEqual({});
    expect(createOnrampQuote).not.toHaveBeenCalled();
    expect(createOnramp).not.toHaveBeenCalled();
  });
});
