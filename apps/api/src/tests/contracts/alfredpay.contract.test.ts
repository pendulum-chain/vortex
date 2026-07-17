/**
 * External API contract: Alfredpay (docs/features/contract-tests.md).
 *
 * The same consumed-contract schemas run against the fake (hermetic, PR-blocking)
 * and against the partner API (live, nightly). Live tests skip cleanly when
 * ALFREDPAY_* credentials are absent; the transaction-creating and account-reading
 * tests additionally require pre-provisioned sandbox fixtures (see .env.example):
 *
 *  - ALFREDPAY_CONTRACT_CUSTOMER_ID       KYC-approved MX sandbox customer
 *  - ALFREDPAY_CONTRACT_FIAT_ACCOUNT_ID   SPEI fiat account of that customer
 *  - ALFREDPAY_CONTRACT_KYC_SUBMISSION_ID a KYC submission of that customer
 *
 * Per PRD, at most one transaction per direction is created per run, and nothing
 * progresses past the point where a real payment would be required (an onramp
 * stays CREATED / awaiting payment). `getQuote` has no production consumers and
 * is deliberately uncovered.
 */
import { describe, expect, test } from "bun:test";
import {
  AlfredpayApiService,
  AlfredpayChain,
  alfredpayConfigsResponseSchema,
  alfredpayCreateOnrampResponseSchema,
  AlfredpayFeeType,
  alfredpayFiatAccountsResponseSchema,
  AlfredpayFiatAccountType,
  AlfredpayFiatCurrency,
  alfredpayKycStatusResponseSchema,
  alfredpayOfframpTransactionSchema,
  AlfredpayOnChainCurrency,
  alfredpayOnrampTransactionSchema,
  AlfredpayPaymentMethodType,
  alfredpayQuoteResponseSchema,
  AlfredpayTradeLimitError,
  type CreateAlfredpayOnrampQuoteRequest
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeAlfredpay } from "../../test-utils/fake-world/fake-anchors";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;
const HAS_CREDS = !!(process.env.ALFREDPAY_API_KEY && process.env.ALFREDPAY_API_SECRET);
const CUSTOMER_ID = process.env.ALFREDPAY_CONTRACT_CUSTOMER_ID;
const FIAT_ACCOUNT_ID = process.env.ALFREDPAY_CONTRACT_FIAT_ACCOUNT_ID;
const KYC_SUBMISSION_ID = process.env.ALFREDPAY_CONTRACT_KYC_SUBMISSION_ID;

if (RUN_LIVE && !HAS_CREDS) {
  console.warn("[contract:live] Alfredpay live half skipped: ALFREDPAY_API_KEY/ALFREDPAY_API_SECRET not set");
}

// Unremarkable placeholder wallet, mirroring the squidrouter suite.
const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

// Sentinel used by production quote requests for anonymous rate discovery
// (ALFREDPAY_ANONYMOUS_CUSTOMER_ID in quote/alfredpay-customer.ts — metadata.customerId
// is tracking-only on quote requests).
const QUOTE_METADATA = { businessId: "vortex", customerId: "anonymous" };

function onrampQuoteRequest(fromAmount: string): CreateAlfredpayOnrampQuoteRequest {
  // Mirrors OnRampInitializeAlfredpayEngine: fiat -> USDC minted on Polygon.
  return {
    chain: AlfredpayChain.MATIC,
    fromAmount,
    fromCurrency: AlfredpayFiatCurrency.MXN,
    metadata: QUOTE_METADATA,
    paymentMethodType: AlfredpayPaymentMethodType.BANK,
    toCurrency: AlfredpayOnChainCurrency.USDC
  };
}

describe("Alfredpay external API contract — hermetic (fake)", () => {
  function seededFake() {
    const fake = new FakeAlfredpay();
    fake.quoteFees = [{ amount: "12.50", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    return fake;
  }

  test("fake onramp and offramp quotes satisfy the quote contract", async () => {
    const api = seededFake().asService();
    const onrampQuote = await api.createOnrampQuote(onrampQuoteRequest("500"));
    expect(() => alfredpayQuoteResponseSchema.parse(onrampQuote)).not.toThrow();

    const offrampQuote = await api.createOfframpQuote({
      chain: AlfredpayChain.MATIC,
      fromAmount: "30",
      fromCurrency: AlfredpayOnChainCurrency.USDC,
      metadata: QUOTE_METADATA,
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency: AlfredpayFiatCurrency.MXN
    });
    expect(() => alfredpayQuoteResponseSchema.parse(offrampQuote)).not.toThrow();
  });

  test("fake onramp order and transaction polling satisfy their contracts", async () => {
    const fake = seededFake();
    const api = fake.asService();
    const order = await api.createOnramp({
      amount: "500",
      chain: AlfredpayChain.MATIC,
      customerId: "cust-1",
      depositAddress: TEST_ADDRESS,
      fromCurrency: AlfredpayFiatCurrency.MXN,
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      quoteId: "quote-1",
      toCurrency: AlfredpayOnChainCurrency.USDC
    });
    expect(() => alfredpayCreateOnrampResponseSchema.parse(order)).not.toThrow();

    const transaction = await api.getOnrampTransaction(order.transaction.transactionId);
    expect(() => alfredpayOnrampTransactionSchema.parse(transaction)).not.toThrow();
  });

  test("fake offramp order and transaction polling satisfy their contracts", async () => {
    const api = seededFake().asService();
    const order = await api.createOfframp({
      amount: "30",
      chain: AlfredpayChain.MATIC,
      customerId: "cust-1",
      fiatAccountId: "fa-1",
      fromCurrency: AlfredpayOnChainCurrency.USDC,
      originAddress: TEST_ADDRESS,
      quoteId: "quote-1",
      toCurrency: AlfredpayFiatCurrency.MXN
    });
    expect(() => alfredpayOfframpTransactionSchema.parse(order)).not.toThrow();

    const transaction = await api.getOfframpTransaction(order.transactionId);
    expect(() => alfredpayOfframpTransactionSchema.parse(transaction)).not.toThrow();
  });

  test("fake fiat account listing satisfies the contract", async () => {
    const fake = seededFake();
    fake.fiatAccountsByCustomer.set("cust-1", [
      {
        accountNumber: "646180157000000004",
        accountType: "checking",
        customerId: "cust-1",
        fiatAccountId: "fa-1",
        type: AlfredpayFiatAccountType.SPEI
      }
    ]);
    const accounts = await fake.asService().listFiatAccounts("cust-1");
    expect(() => alfredpayFiatAccountsResponseSchema.parse(accounts)).not.toThrow();
  });
});

describe.skipIf(!RUN_LIVE || !HAS_CREDS)("Alfredpay external API contract — live", () => {
  const api = () => AlfredpayApiService.getInstance();

  test(
    "GET /configurations response satisfies the configs contract",
    async () => {
      const configs = await runLive("alfredpay getAllConfigs", () => api().getAllConfigs());
      if (!configs) return; // inconclusive — see test-utils/contract-support.ts
      alfredpayConfigsResponseSchema.parse(configs);
    },
    60_000
  );

  test(
    "POST /quotes responses satisfy the quote contract (both directions)",
    async () => {
      const onrampQuote = await runLive("alfredpay createOnrampQuote", () => api().createOnrampQuote(onrampQuoteRequest("500")));
      if (onrampQuote) alfredpayQuoteResponseSchema.parse(onrampQuote);

      const offrampQuote = await runLive("alfredpay createOfframpQuote", () =>
        api().createOfframpQuote({
          chain: AlfredpayChain.MATIC,
          fromAmount: "30",
          fromCurrency: AlfredpayOnChainCurrency.USDC,
          metadata: QUOTE_METADATA,
          paymentMethodType: AlfredpayPaymentMethodType.BANK,
          toCurrency: AlfredpayFiatCurrency.MXN
        })
      );
      if (offrampQuote) alfredpayQuoteResponseSchema.parse(offrampQuote);
    },
    60_000
  );

  test(
    "an absurd quote amount still yields the limit-breach error contract",
    async () => {
      // The 409 body is consumed inside executeRequest, which turns it into
      // AlfredpayTradeLimitError — the parsed error carries the consumed fields. A
      // generic Error here would mean the errorCode/errorMetadata shape drifted.
      const limitError = await runLive("alfredpay limit breach", async () => {
        try {
          await api().createOnrampQuote(onrampQuoteRequest("999999999999"));
          return null; // no maximum configured for the pair — nothing to assert
        } catch (error) {
          if (error instanceof AlfredpayTradeLimitError) return error;
          throw error; // network/5xx etc. -> inconclusive
        }
      });
      if (!limitError) return;
      expect(limitError.kind).toBe("above");
      expect(limitError.quantity).toMatch(/^\d+(\.\d+)?$/);
      expect(limitError.fromCurrency.length).toBeGreaterThan(0);
    },
    60_000
  );

  test.skipIf(!CUSTOMER_ID)(
    "GET /fiatAccounts response satisfies the fiat accounts contract",
    async () => {
      const accounts = await runLive("alfredpay listFiatAccounts", () => api().listFiatAccounts(CUSTOMER_ID as string));
      if (!accounts) return;
      alfredpayFiatAccountsResponseSchema.parse(accounts);
    },
    60_000
  );

  test.skipIf(!CUSTOMER_ID || !KYC_SUBMISSION_ID)(
    "GET /kyc/{submissionId}/status response satisfies the KYC status contract",
    async () => {
      const status = await runLive("alfredpay getKycStatus", () =>
        api().getKycStatus(CUSTOMER_ID as string, KYC_SUBMISSION_ID as string)
      );
      if (!status) return;
      alfredpayKycStatusResponseSchema.parse(status);
    },
    60_000
  );

  test.skipIf(!CUSTOMER_ID)(
    "POST /onramp + GET /onramp/{id} responses satisfy their contracts (stops at awaiting payment)",
    async () => {
      const quote = await runLive("alfredpay onramp quote (order)", () =>
        api().createOnrampQuote({
          ...onrampQuoteRequest("500"),
          metadata: { businessId: "vortex", customerId: CUSTOMER_ID as string }
        })
      );
      if (!quote) return;

      const order = await runLive("alfredpay createOnramp", () =>
        api().createOnramp({
          amount: quote.fromAmount,
          chain: AlfredpayChain.MATIC,
          customerId: CUSTOMER_ID as string,
          depositAddress: TEST_ADDRESS,
          fromCurrency: AlfredpayFiatCurrency.MXN,
          paymentMethodType: AlfredpayPaymentMethodType.BANK,
          quoteId: quote.quoteId,
          toCurrency: AlfredpayOnChainCurrency.USDC
        })
      );
      if (!order) return;
      alfredpayCreateOnrampResponseSchema.parse(order);

      const transaction = await runLive("alfredpay getOnrampTransaction", () =>
        api().getOnrampTransaction(order.transaction.transactionId)
      );
      if (!transaction) return;
      alfredpayOnrampTransactionSchema.parse(transaction);
    },
    120_000
  );

  test.skipIf(!CUSTOMER_ID || !FIAT_ACCOUNT_ID)(
    "POST /offramp + GET /offramp/{id} responses satisfy their contracts (no deposit is made)",
    async () => {
      const quote = await runLive("alfredpay offramp quote (order)", () =>
        api().createOfframpQuote({
          chain: AlfredpayChain.MATIC,
          fromAmount: "30",
          fromCurrency: AlfredpayOnChainCurrency.USDC,
          metadata: { businessId: "vortex", customerId: CUSTOMER_ID as string },
          paymentMethodType: AlfredpayPaymentMethodType.BANK,
          toCurrency: AlfredpayFiatCurrency.MXN
        })
      );
      if (!quote) return;

      const order = await runLive("alfredpay createOfframp", () =>
        api().createOfframp({
          amount: quote.fromAmount,
          chain: AlfredpayChain.MATIC,
          customerId: CUSTOMER_ID as string,
          fiatAccountId: FIAT_ACCOUNT_ID as string,
          fromCurrency: AlfredpayOnChainCurrency.USDC,
          originAddress: TEST_ADDRESS,
          quoteId: quote.quoteId,
          toCurrency: AlfredpayFiatCurrency.MXN
        })
      );
      if (!order) return;
      alfredpayOfframpTransactionSchema.parse(order);

      const transaction = await runLive("alfredpay getOfframpTransaction", () => api().getOfframpTransaction(order.transactionId));
      if (!transaction) return;
      alfredpayOfframpTransactionSchema.parse(transaction);
    },
    120_000
  );
});

// Not gated on HAS_CREDS: in the nightly (CONTRACT_EXPECT_LIVE=1) missing credentials
// are exactly the rot this must turn into a failure.
test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
