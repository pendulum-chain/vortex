import { describe, expect, test } from "bun:test";
import {
  aveniaAccountBalanceSchema,
  aveniaAccountInfoSchema,
  aveniaAccountLimitsSchema,
  aveniaPayinTicketsSchema,
  aveniaPayoutTicketSchema,
  aveniaPixInputTicketSchema,
  aveniaPixKeyDataSchema,
  aveniaQuoteResponseSchema
} from "./schemas";

function validQuoteBody() {
  return {
    appliedFees: [
      { amount: "0.25", currency: "BRLA", rebatable: false, type: "Gas Fee" },
      { amount: "1.00", currency: "BRL", rebatable: true, type: "In Fee" }
    ],
    basePrice: "1",
    inputAmount: "100",
    inputCurrency: "BRL",
    inputPaymentMethod: "PIX",
    outputAmount: "98.75",
    quoteToken: "quote-token-1"
  };
}

describe("aveniaQuoteResponseSchema", () => {
  test("accepts a full quote including fields we don't consume", () => {
    expect(() => aveniaQuoteResponseSchema.parse(validQuoteBody())).not.toThrow();
  });

  test("rejects a missing consumed field (quoteToken)", () => {
    const body = validQuoteBody();
    delete (body as Record<string, unknown>).quoteToken;
    expect(() => aveniaQuoteResponseSchema.parse(body)).toThrow();
  });

  test("rejects a fee type outside the consumed enum", () => {
    const body = validQuoteBody();
    body.appliedFees[0].type = "Express Fee";
    expect(() => aveniaQuoteResponseSchema.parse(body)).toThrow();
  });
});

describe("aveniaPixKeyDataSchema", () => {
  test("accepts a masked taxId, rejects an empty one", () => {
    expect(() => aveniaPixKeyDataSchema.parse({ bankName: "B", name: "N", taxId: "***.123.456-**" })).not.toThrow();
    expect(() => aveniaPixKeyDataSchema.parse({ bankName: "B", name: "N", taxId: "" })).toThrow();
  });
});

describe("aveniaPixInputTicketSchema", () => {
  test("requires id and brCode", () => {
    expect(() =>
      aveniaPixInputTicketSchema.parse({ brCode: "brcode-1", expiration: "2026-07-07T12:00:00Z", id: "t-1" })
    ).not.toThrow();
    expect(() => aveniaPixInputTicketSchema.parse({ id: "t-1" })).toThrow();
  });
});

describe("aveniaPayoutTicketSchema / aveniaPayinTicketsSchema", () => {
  test("accepts consumed statuses, rejects an unknown one", () => {
    expect(() => aveniaPayoutTicketSchema.parse({ id: "t-1", status: "PAID" })).not.toThrow();
    expect(() => aveniaPayoutTicketSchema.parse({ id: "t-1", status: "SETTLED" })).toThrow();
    // Observed pre-payment lifecycle of a pay-in ticket: UNPAID -> PROCESSING -> PAID.
    expect(() =>
      aveniaPayinTicketsSchema.parse([
        { id: "t-1", status: "UNPAID" },
        { id: "t-2", status: "PROCESSING" },
        { id: "t-3", status: "PAID" }
      ])
    ).not.toThrow();
    expect(() => aveniaPayinTicketsSchema.parse([{ status: "PENDING" }])).toThrow();
  });
});

describe("aveniaAccountLimitsSchema", () => {
  test("accepts the consumed limit fields, rejects a missing usedLimit entry", () => {
    const body = {
      limitInfo: {
        blocked: false,
        createdAt: "2026-01-01T00:00:00Z",
        limits: [
          {
            currency: "BRL",
            maxChainIn: "1000",
            maxChainOut: "1000",
            maxFiatIn: "10000",
            maxFiatOut: "10000",
            usedLimit: { month: 7, usedChainIn: "0", usedChainOut: "0", usedFiatIn: "150.50", usedFiatOut: "0", year: 2026 }
          }
        ]
      }
    };
    expect(() => aveniaAccountLimitsSchema.parse(body)).not.toThrow();
    delete (body.limitInfo.limits[0].usedLimit as Record<string, unknown>).usedFiatIn;
    expect(() => aveniaAccountLimitsSchema.parse(body)).toThrow();
  });
});

describe("aveniaAccountBalanceSchema", () => {
  test("requires a decimal-string BRLA balance (wire shape)", () => {
    expect(() =>
      aveniaAccountBalanceSchema.parse({ balances: { ARSA: "0", BRLA: "99.8", USDC: "0", USDM: "0", USDT: "0" } })
    ).not.toThrow();
    expect(() => aveniaAccountBalanceSchema.parse({ balances: { BRLA: 99.8 } })).toThrow();
  });
});

describe("aveniaAccountInfoSchema", () => {
  test("accepts a subaccount with an EVM wallet, rejects an unknown identityStatus", () => {
    const body = {
      accountInfo: { accountType: "INDIVIDUAL", identityStatus: "CONFIRMED" },
      brCode: "brcode",
      createdAt: "2026-01-01T00:00:00Z",
      id: "sub-1",
      pixKey: "pix-key",
      wallets: [{ chain: "EVM", id: "w-1", walletAddress: "0x7ba99e99bc669b3508aff9cc0a898e869459f877" }]
    };
    expect(() => aveniaAccountInfoSchema.parse(body)).not.toThrow();
    body.accountInfo.identityStatus = "PENDING";
    expect(() => aveniaAccountInfoSchema.parse(body)).toThrow();
  });
});
