import { describe, expect, test } from "bun:test";
import {
  aveniaAccountBalanceSchema,
  aveniaAccountInfoSchema,
  aveniaAccountLimitsSchema,
  aveniaDocumentResponseSchema,
  aveniaImportKycTokenResponseSchema,
  aveniaKybAttemptStatusSchema,
  aveniaKycAttemptsSchema,
  aveniaLevel1ResponseSchema,
  aveniaPayinTicketsSchema,
  aveniaPayoutTicketSchema,
  aveniaPixInputTicketSchema,
  aveniaPixKeyDataSchema,
  aveniaQuoteResponseSchema,
  aveniaUboResponseSchema,
  aveniaWebhookRegistrationSchema,
  aveniaWebhooksListSchema
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

  test("requires the provider usage year and month", () => {
    const usedLimit: Record<string, unknown> = { month: 7, usedFiatIn: "0", usedFiatOut: "0", year: 2026 };
    const body = {
      limitInfo: { limits: [{ currency: "BRL", maxFiatIn: "10000", maxFiatOut: "10000", usedLimit }] }
    };

    expect(() => aveniaAccountLimitsSchema.parse(body)).not.toThrow();
    delete usedLimit.month;
    expect(() => aveniaAccountLimitsSchema.parse(body)).toThrow();
    usedLimit.month = 7;
    delete usedLimit.year;
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

describe("Avenia KYB Level 1 response schemas", () => {
  test("accepts document readiness and identifier responses", () => {
    expect(() =>
      aveniaDocumentResponseSchema.parse({
        document: {
          documentType: "CERTIFICATE-OF-INCORPORATION",
          id: "document-1",
          ready: true,
          uploadStatusFront: "PROCESSED"
        }
      })
    ).not.toThrow();
    expect(() => aveniaDocumentResponseSchema.parse({ document: { id: "document-1", ready: true } })).toThrow();
    expect(() => aveniaUboResponseSchema.parse({ id: "ubo-1" })).not.toThrow();
    expect(() => aveniaLevel1ResponseSchema.parse({ id: "attempt-1" })).not.toThrow();
  });

  test("accepts the documented completed KYB attempt and pending attempts without a result", () => {
    const attempt = {
      createdAt: "2026-03-19T22:09:52.629984Z",
      id: "attempt-1",
      levelName: "kyb-level-1",
      result: "APPROVED",
      resultMessage: "",
      retryable: false,
      status: "COMPLETED",
      updatedAt: "2026-03-19T22:09:52.629984Z"
    };
    expect(() => aveniaKybAttemptStatusSchema.parse({ attempt })).not.toThrow();
    expect(() =>
      aveniaKybAttemptStatusSchema.parse({ attempt: { ...attempt, result: undefined, status: "PENDING" } })
    ).not.toThrow();
    expect(() => aveniaKybAttemptStatusSchema.parse({ attempt: { ...attempt, status: "APPROVED" } })).toThrow();
  });

  test("accepts an unsettled attempt with resultMessage and retryable absent", () => {
    // Avenia omits resultMessage and retryable until an attempt settles, so a PENDING poll
    // must parse instead of raising a ZodError that would surface as a 502.
    const pending = {
      createdAt: "2026-03-19T22:09:52.629984Z",
      id: "attempt-1",
      levelName: "kyb-level-1",
      status: "PENDING",
      updatedAt: "2026-03-19T22:09:52.629984Z"
    };
    expect(() => aveniaKybAttemptStatusSchema.parse({ attempt: pending })).not.toThrow();
    expect(() => aveniaKycAttemptsSchema.parse({ attempts: [pending] })).not.toThrow();
  });

  test("normalizes documented null result fields on unsettled attempts", () => {
    const pending = {
      createdAt: "2026-03-19T22:09:52.629984Z",
      id: "attempt-1",
      levelName: "sumsub-token-recipient",
      result: null,
      resultMessage: null,
      retryable: null,
      status: "PENDING",
      submissionData: null,
      updatedAt: "2026-03-19T22:09:52.629984Z"
    };
    expect(aveniaKybAttemptStatusSchema.parse({ attempt: pending }).attempt).toMatchObject({
      result: undefined,
      resultMessage: undefined,
      retryable: undefined,
      submissionData: undefined
    });
    expect(aveniaKycAttemptsSchema.parse({ attempts: [pending] }).attempts[0]).toMatchObject({
      result: undefined,
      resultMessage: undefined,
      retryable: undefined,
      submissionData: undefined
    });
  });

  test("normalizes Avenia's empty terminal cursor", () => {
    expect(aveniaKycAttemptsSchema.parse({ attempts: [], cursor: "" }).cursor).toBeUndefined();
  });
});

describe("aveniaImportKycTokenResponseSchema", () => {
  test("requires nonempty id and message fields", () => {
    expect(() => aveniaImportKycTokenResponseSchema.parse({ id: "attempt-1", message: "processing KYC" })).not.toThrow();
    expect(() => aveniaImportKycTokenResponseSchema.parse({ id: "", message: "processing KYC" })).toThrow();
    expect(() => aveniaImportKycTokenResponseSchema.parse({ id: "attempt-1", message: "" })).toThrow();
  });
});

describe("Avenia webhook management schemas", () => {
  test("accepts the create response's webhookId field", () => {
    expect(() => aveniaWebhookRegistrationSchema.parse({ webhookId: "webhook-1" })).not.toThrow();
    expect(() => aveniaWebhookRegistrationSchema.parse({ id: "webhook-1" })).toThrow();
  });

  test("accepts list entries with url and rejects the request-only webhookUrl field", () => {
    const response = {
      webhooks: [
        {
          createdAt: "2026-01-01T00:00:00Z",
          id: "webhook-1",
          subscriptions: ["*"],
          updatedAt: "2026-01-01T00:00:00Z",
          url: "https://example.com/avenia"
        }
      ]
    };

    expect(() => aveniaWebhooksListSchema.parse(response)).not.toThrow();
    const [webhook] = response.webhooks;
    const url = webhook.url;
    delete (webhook as Partial<typeof webhook>).url;
    Object.assign(webhook, { webhookUrl: url });
    expect(() => aveniaWebhooksListSchema.parse(response)).toThrow();
  });
});
