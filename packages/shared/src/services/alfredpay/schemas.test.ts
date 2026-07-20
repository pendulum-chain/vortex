import { describe, expect, test } from "bun:test";
import {
  alfredpayConfigsResponseSchema,
  alfredpayCreateOnrampResponseSchema,
  alfredpayFiatAccountsResponseSchema,
  alfredpayKycStatusResponseSchema,
  alfredpayLimitErrorBodySchema,
  alfredpayOfframpTransactionSchema,
  alfredpayOnrampTransactionSchema,
  alfredpayQuoteResponseSchema
} from "./schemas";

function validQuoteBody() {
  return {
    chain: "MATIC",
    expiration: "2026-07-07T12:00:00.000Z",
    fees: [{ amount: "12.50", currency: "MXN", type: "processingFee" }],
    fromAmount: "500",
    fromCurrency: "MXN",
    metadata: { businessId: "vortex" },
    paymentMethodType: "BANK",
    quoteId: "q-abc",
    rate: "0.058",
    toAmount: "28.75",
    toCurrency: "USDC"
  };
}

describe("alfredpayConfigsResponseSchema", () => {
  test("accepts a pair including fields we don't consume and a null typeCustomer", () => {
    const body = {
      supportedPairs: [
        {
          businessId: null,
          createdAt: "2026-01-01T00:00:00Z",
          decimals: "2",
          fromCurrency: "MXN",
          id: "pair-1",
          maxQuantity: "100000",
          minQuantity: "100",
          toCurrency: "USDC",
          typeCustomer: null,
          updatedAt: "2026-01-01T00:00:00Z"
        }
      ]
    };
    expect(() => alfredpayConfigsResponseSchema.parse(body)).not.toThrow();
  });

  test("accepts the junk rows the live listing contains (null/empty decimals, null fromCurrency)", () => {
    const body = {
      supportedPairs: [
        { decimals: null, fromCurrency: "MXN", maxQuantity: "170799.99", minQuantity: "50.00", toCurrency: "USDC", typeCustomer: "INDIVIDUAL" },
        { decimals: "", fromCurrency: "PEN", maxQuantity: "295349602.00", minQuantity: "1.00", toCurrency: "USDC", typeCustomer: null },
        { decimals: null, fromCurrency: null, maxQuantity: "295349602.00", minQuantity: "1.00", toCurrency: "USDT", typeCustomer: null }
      ]
    };
    expect(() => alfredpayConfigsResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects a pair with a missing consumed field (minQuantity)", () => {
    const body = {
      supportedPairs: [{ decimals: "2", fromCurrency: "MXN", maxQuantity: "100000", toCurrency: "USDC", typeCustomer: null }]
    };
    expect(() => alfredpayConfigsResponseSchema.parse(body)).toThrow();
  });
});

describe("alfredpayQuoteResponseSchema", () => {
  test("accepts a full quote including fields we don't consume", () => {
    expect(() => alfredpayQuoteResponseSchema.parse(validQuoteBody())).not.toThrow();
  });

  test("rejects a missing consumed field (quoteId)", () => {
    const body = validQuoteBody();
    delete (body as Record<string, unknown>).quoteId;
    expect(() => alfredpayQuoteResponseSchema.parse(body)).toThrow();
  });

  test("rejects a non-decimal toAmount", () => {
    const body = validQuoteBody();
    body.toAmount = "28,75";
    expect(() => alfredpayQuoteResponseSchema.parse(body)).toThrow();
  });

  test("rejects an unparseable expiration", () => {
    const body = validQuoteBody();
    body.expiration = "soon";
    expect(() => alfredpayQuoteResponseSchema.parse(body)).toThrow();
  });
});

describe("alfredpayCreateOnrampResponseSchema", () => {
  test("accepts rail-specific instructions as an opaque object", () => {
    const body = {
      fiatPaymentInstructions: { clabe: "646180157000000004", paymentType: "SPEI", reference: "REF" },
      transaction: { status: "CREATED", transactionId: "tx-1" }
    };
    expect(() => alfredpayCreateOnrampResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects a missing transactionId", () => {
    const body = { fiatPaymentInstructions: {}, transaction: { status: "CREATED" } };
    expect(() => alfredpayCreateOnrampResponseSchema.parse(body)).toThrow();
  });
});

describe("alfredpayOnrampTransactionSchema", () => {
  test("accepts a transaction without metadata (read defensively)", () => {
    expect(() => alfredpayOnrampTransactionSchema.parse({ status: "CREATED" })).not.toThrow();
    expect(() => alfredpayOnrampTransactionSchema.parse({ metadata: null, status: "FAILED" })).not.toThrow();
  });

  test("rejects a status outside the consumed enum", () => {
    expect(() => alfredpayOnrampTransactionSchema.parse({ status: "SETTLED" })).toThrow();
  });
});

describe("alfredpayOfframpTransactionSchema", () => {
  test("rejects a non-EVM depositAddress", () => {
    const body = {
      depositAddress: "not-an-address",
      expiration: "2026-07-07T12:00:00.000Z",
      fromAmount: "25",
      status: "ON_CHAIN_DEPOSIT_RECEIVED",
      toCurrency: "MXN",
      transactionId: "tx-2"
    };
    expect(() => alfredpayOfframpTransactionSchema.parse(body)).toThrow();
    body.depositAddress = "0x5afe00000000000000000000000000000000d0e5";
    expect(() => alfredpayOfframpTransactionSchema.parse(body)).not.toThrow();
  });

  test("accepts the pre-deposit CREATED status of a fresh offramp", () => {
    const body = {
      depositAddress: "0x5afe00000000000000000000000000000000d0e5",
      expiration: "2026-07-07T12:00:00.000Z",
      fromAmount: "30",
      status: "CREATED",
      toCurrency: "MXN",
      transactionId: "tx-3"
    };
    expect(() => alfredpayOfframpTransactionSchema.parse(body)).not.toThrow();
  });
});

describe("alfredpayFiatAccountsResponseSchema", () => {
  test("accepts accounts with and without the optional display fields", () => {
    const body = [
      { accountNumber: "000123456789", fiatAccountId: "fa-1", type: "ACH" },
      {
        accountName: "Main",
        accountNumber: "646180157000000004",
        customerId: "c-1",
        fiatAccountId: "fa-2",
        metadata: { accountHolderName: "Test User", documentType: "INE" },
        type: "SPEI"
      }
    ];
    expect(() => alfredpayFiatAccountsResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects an account with a missing consumed field (accountNumber)", () => {
    expect(() => alfredpayFiatAccountsResponseSchema.parse([{ fiatAccountId: "fa-1", type: "ACH" }])).toThrow();
  });
});

describe("alfredpayKycStatusResponseSchema", () => {
  test("accepts all guarded metadata shapes", () => {
    expect(() => alfredpayKycStatusResponseSchema.parse({ status: "COMPLETED", updatedAt: "x" })).not.toThrow();
    expect(() => alfredpayKycStatusResponseSchema.parse({ metadata: null, status: "FAILED" })).not.toThrow();
    expect(() =>
      alfredpayKycStatusResponseSchema.parse({ metadata: { failureReason: "doc blurry" }, status: "UPDATE_REQUIRED" })
    ).not.toThrow();
  });

  test("rejects a status outside the consumed enum", () => {
    expect(() => alfredpayKycStatusResponseSchema.parse({ status: "APPROVED" })).toThrow();
  });
});

describe("alfredpayLimitErrorBodySchema", () => {
  test("accepts both the above-max and below-min variants (quantities are wire numbers)", () => {
    expect(() =>
      alfredpayLimitErrorBodySchema.parse({
        errorCode: 111426,
        errorMetadata: { fromCurrency: "MXN", maxQuantity: 86996891.21 },
        message: "Trade limit exceeded"
      })
    ).not.toThrow();
    expect(() =>
      alfredpayLimitErrorBodySchema.parse({ errorCode: 111426, errorMetadata: { fromCurrency: "MXN", minQuantity: 100 } })
    ).not.toThrow();
  });

  test("rejects a different errorCode, stringly quantities, or missing fromCurrency", () => {
    expect(() =>
      alfredpayLimitErrorBodySchema.parse({ errorCode: 111427, errorMetadata: { fromCurrency: "MXN", maxQuantity: 1 } })
    ).toThrow();
    expect(() =>
      alfredpayLimitErrorBodySchema.parse({ errorCode: 111426, errorMetadata: { fromCurrency: "MXN", maxQuantity: "1" } })
    ).toThrow();
    expect(() => alfredpayLimitErrorBodySchema.parse({ errorCode: 111426, errorMetadata: { maxQuantity: 1 } })).toThrow();
  });
});
