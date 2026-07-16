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
 *
 * KYB: the details read runs with the rest of the live half against a hard-coded sandbox
 * business customer (KYB_CUSTOMER_ID). The full company-onboarding sequence is opt-in via
 * ALFREDPAY_CONTRACT_RUN_KYB_FLOW=1 because it leaves a business customer behind per run:
 *
 *   RUN_LIVE_TESTS=1 ALFREDPAY_CONTRACT_RUN_KYB_FLOW=1 bun test alfredpay.contract
 */
import { describe, expect, test } from "bun:test";
import {
  AlfredpayApiService,
  AlfredpayChain,
  alfredpayConfigsResponseSchema,
  alfredpayCreateOnrampResponseSchema,
  AlfredpayFeeType,
  alfredpayFiatAccountsResponseSchema,
  AlfredpayCustomerType,
  AlfredpayFiatAccountType,
  AlfredpayFiatCurrency,
  alfredpayKybBusinessDetailsResponseSchema,
  AlfredpayKybFileType,
  AlfredpayKybRelatedPersonFileType,
  alfredpayKycStatusResponseSchema,
  alfredpayOfframpTransactionSchema,
  AlfredpayOnChainCurrency,
  alfredpayOnrampTransactionSchema,
  AlfredpayPaymentMethodType,
  alfredpayQuoteResponseSchema,
  AlfredpayTradeLimitError,
  type CreateAlfredpayOnrampQuoteRequest,
  type SubmitKybInformationRequest
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeAlfredpay } from "../../test-utils/fake-world/fake-anchors";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;
const HAS_CREDS = !!(process.env.ALFREDPAY_API_KEY && process.env.ALFREDPAY_API_SECRET);
const CUSTOMER_ID = process.env.ALFREDPAY_CONTRACT_CUSTOMER_ID;
const FIAT_ACCOUNT_ID = process.env.ALFREDPAY_CONTRACT_FIAT_ACCOUNT_ID;
const KYC_SUBMISSION_ID = process.env.ALFREDPAY_CONTRACT_KYC_SUBMISSION_ID;
const RUN_KYB_FLOW = !!process.env.ALFREDPAY_CONTRACT_RUN_KYB_FLOW;

// A sandbox MX company put through the full KYB by the flow test below, so the details read
// exercises a fully populated business: four company documents, both representative documents, and a
// stored `questionnaire`. Its submission is FAILED (see the flow test — the sandbox rejects the
// blank placeholder images), which does not affect this read: details are served regardless of
// verification outcome. Re-create it with ALFREDPAY_CONTRACT_RUN_KYB_FLOW=1 and pin the new id here
// if Alfredpay ever clears the sandbox.
const KYB_CUSTOMER_ID = "5f4a1e58-6b74-454c-bc89-defb8df593be";

// 1x1 transparent PNG: the uploads only need a well-formed image of an accepted mime type.
const BLANK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function blankPng(): File {
  const bytes = Uint8Array.from(atob(BLANK_PNG_BASE64), character => character.charCodeAt(0));
  return new File([bytes], "blank.png", { type: "image/png" });
}

function kybFlowForm(email: string): SubmitKybInformationRequest {
  return {
    accountPurpose: "Treasury management",
    address: "Avenida Paseo de la Reforma 100",
    businessActivities: "Cross-border payments software",
    businessName: "Vortex Contract Test SA de CV",
    city: "Ciudad de Mexico",
    country: "MX",
    expectedMonthlyTransactions: 120,
    expectedMonthlyVolumeUsd: 50000,
    // false keeps the run on the unregulated branch, which is what the document set below covers.
    isRegulatedBusiness: false,
    operatesInSanctionedCountries: false,
    relatedPersons: [
      {
        dateOfBirth: "1990-01-01",
        email,
        firstName: "Ana",
        lastName: "Rep",
        nationalities: ["MX"],
        // Not required for MX, but Alfredpay requires it for CO/US.
        pep: false
      }
    ],
    sourceOfFunds: "Sale of goods/services",
    state: "CDMX",
    taxId: "AAA010101AAA",
    transmitsCustomerFunds: false,
    walletAddresses: "N/A",
    website: "https://vortex-contract-test.example.com",
    zipCode: "06600"
  };
}

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

  /**
   * The pair the KYB document uploads depend on: `submissionId` keys the company-document
   * uploads, `relatedPersons[].idRelatedPerson` keys the representative's. Both were modelled
   * from Alfredpay's docs and asserted only by our own mocks until this test — see the raw
   * payload it prints when diagnosing an upload the provider refuses.
   */
  test(
    "GET /kyb/details response satisfies the KYB business details contract",
    async () => {
      const details = await runLive("alfredpay getKybBusinessDetails", () => api().getKybBusinessDetails(KYB_CUSTOMER_ID));
      if (!details) return;
      console.info(`[contract:live] kyb/details raw payload:\n${JSON.stringify(details, null, 2)}`);
      alfredpayKybBusinessDetailsResponseSchema.parse(details);
    },
    60_000
  );
});

/**
 * The full MX company KYB sequence the widget and dashboard drive, against the live sandbox:
 * create business customer -> submit info -> 3 company documents -> details -> representative's
 * document pair -> finalize -> status.
 *
 * Opt-in (ALFREDPAY_CONTRACT_RUN_KYB_FLOW=1) rather than nightly: unlike the ramp tests, which
 * stop before money moves, this leaves a business customer behind on every run.
 *
 * Deliberately not wrapped in `runLive`: this is a diagnostic probe, so a provider rejection must
 * surface as a failure with its body rather than be logged as inconclusive. Each step prints its
 * raw response.
 *
 * "Completes" means every call is accepted and every response shape holds. The submission itself is
 * then rejected by the sandbox's verification (FAILED, ~30s) because the uploads are placeholder
 * images — see the note on the status step.
 */
describe.skipIf(!RUN_LIVE || !HAS_CREDS || !RUN_KYB_FLOW)("Alfredpay KYB sandbox flow — live", () => {
  test(
    "a Mexican company KYB completes every step end to end",
    async () => {
      const api = AlfredpayApiService.getInstance();
      const email = `vortex-kyb-contract-${Date.now()}@example.com`;

      const customer = await api.createCustomer(email, AlfredpayCustomerType.BUSINESS, "MX");
      console.info(`[contract:kyb] createCustomer -> ${JSON.stringify(customer)}`);
      const customerId = customer.customerId;
      expect(customerId).toBeTruthy();

      const submission = await api.submitKybInformation(customerId, kybFlowForm(email));
      console.info(`[contract:kyb] submitKybInformation -> ${JSON.stringify(submission)}`);
      const submissionId = submission.submissionId;
      expect(submissionId).toBeTruthy();

      for (const fileType of [
        AlfredpayKybFileType.TAX_ID_DOCUMENT,
        AlfredpayKybFileType.ARTICLES_INCORPORATION,
        AlfredpayKybFileType.PROOF_ADDRESS,
        AlfredpayKybFileType.SHAREHOLDER_REGISTRY
      ]) {
        await api.submitKybFiles(customerId, submissionId, fileType, blankPng());
        console.info(`[contract:kyb] submitKybFiles ${fileType} -> ok`);
      }

      const details = await api.getKybBusinessDetails(customerId);
      console.info(`[contract:kyb] getKybBusinessDetails -> ${JSON.stringify(details, null, 2)}`);
      alfredpayKybBusinessDetailsResponseSchema.parse(details);

      const business = details.find(entry => entry.submissionId === submissionId);
      expect(business).toBeDefined();
      const relatedPersonId = business?.relatedPersons[0]?.idRelatedPerson;
      expect(relatedPersonId).toBeTruthy();

      // The step that fails in the dashboard with errorCode 111301.
      for (const fileType of [AlfredpayKybRelatedPersonFileType.DOC_FRONT, AlfredpayKybRelatedPersonFileType.DOC_BACK]) {
        await api.submitKybRelatedPersonFiles(customerId, relatedPersonId as string, fileType, blankPng());
        console.info(`[contract:kyb] submitKybRelatedPersonFiles ${fileType} -> ok`);
      }

      await api.sendKybSubmission(customerId, submissionId);
      console.info("[contract:kyb] sendKybSubmission -> ok");

      // Alfredpay accepts the submission (IN_REVIEW), then its verification rejects it: the sandbox
      // flips this customer to FAILED within ~30s because the uploads are blank 1x1 PNGs rather than
      // real identity documents. That is the right outcome for placeholder images, so the contract
      // asserted here is that every call is accepted and every response shape holds — not that
      // verification approves. Do not "fix" a FAILED status by chasing the payload.
      const status = await api.getKybStatus(customerId, submissionId);
      console.info(`[contract:kyb] getKybStatus -> ${JSON.stringify(status)}`);
      alfredpayKycStatusResponseSchema.parse(status);
    },
    300_000
  );
});

// Not gated on HAS_CREDS: in the nightly (CONTRACT_EXPECT_LIVE=1) missing credentials
// are exactly the rot this must turn into a failure.
test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
