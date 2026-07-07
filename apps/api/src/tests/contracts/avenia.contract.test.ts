/**
 * External API contract: Avenia/BRLA (docs/features/contract-tests.md).
 *
 * The same consumed-contract schemas run against the fake (hermetic, PR-blocking)
 * and against the partner API (live, nightly). Live tests skip cleanly when BRLA_*
 * credentials are absent; the subaccount-scoped tests additionally require a
 * pre-provisioned, KYC-approved sandbox subaccount (see .env.example):
 *
 *  - AVENIA_CONTRACT_SUBACCOUNT_ID
 *
 * Per PRD, only one transaction (a PIX pay-in ticket, which expires unpaid) is
 * created per run. Payout tickets are covered hermetically only — creating one
 * live would move BRLA balance, and reading one needs the id of a real payout.
 * `createOnchainSwapQuote`/`createOnchainSwapTicket`/`getMainAccountBalance`/
 * `getAveniaSwapTicket` have no production consumers and are deliberately uncovered.
 */
import { describe, expect, test } from "bun:test";
import {
  aveniaAccountBalanceSchema,
  aveniaAccountInfoSchema,
  aveniaAccountLimitsSchema,
  aveniaPayinTicketsSchema,
  AveniaPaymentMethod,
  aveniaPayoutTicketSchema,
  aveniaPixInputTicketSchema,
  aveniaPixKeyDataSchema,
  aveniaQuoteResponseSchema,
  BlockchainSendMethod,
  BrlaApiService,
  BrlaCurrency,
  type PayInQuoteParams
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeBrla } from "../../test-utils/fake-world/fake-anchors";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;
const HAS_CREDS = !!(process.env.BRLA_API_KEY && process.env.BRLA_PRIVATE_KEY);
const SUBACCOUNT_ID = process.env.AVENIA_CONTRACT_SUBACCOUNT_ID;

if (RUN_LIVE && !HAS_CREDS) {
  console.warn("[contract:live] Avenia live half skipped: BRLA_API_KEY/BRLA_PRIVATE_KEY not set");
}

// Mirrors OnRampInitializeAveniaEngine / prepareOnrampBrlTransactions: BRL arrives
// via PIX and lands as BRLA on the (sub)account's internal balance.
function payInQuoteParams(subAccountId?: string): PayInQuoteParams {
  return {
    inputAmount: "100",
    inputCurrency: BrlaCurrency.BRL,
    inputPaymentMethod: AveniaPaymentMethod.PIX,
    inputThirdParty: false,
    outputCurrency: BrlaCurrency.BRLA,
    outputPaymentMethod: AveniaPaymentMethod.INTERNAL,
    outputThirdParty: false,
    ...(subAccountId ? { subAccountId } : {})
  };
}

describe("Avenia external API contract — hermetic (fake)", () => {
  test("fake pay-in and payout quotes satisfy the quote contract", async () => {
    const api = new FakeBrla().asService();
    const payInQuote = await api.createPayInQuote(payInQuoteParams());
    expect(() => aveniaQuoteResponseSchema.parse(payInQuote)).not.toThrow();

    const payOutQuote = await api.createPayOutQuote({ outputAmount: "50", outputThirdParty: false });
    expect(() => aveniaQuoteResponseSchema.parse(payOutQuote)).not.toThrow();
  });

  test("fake pix key validation satisfies the contract", async () => {
    const pixKeyData = await new FakeBrla().asService().validatePixKey("test-pix-key");
    expect(() => aveniaPixKeyDataSchema.parse(pixKeyData)).not.toThrow();
  });

  test("fake ticket creation and polling satisfy their contracts", async () => {
    const fake = new FakeBrla();
    const api = fake.asService();

    const pixInTicket = await api.createPixInputTicket(
      {
        quoteToken: "quote-token",
        ticketBlockchainOutput: { beneficiaryWalletId: "00000000-0000-0000-0000-000000000000" }
      },
      fake.subaccountId
    );
    expect(() => aveniaPixInputTicketSchema.parse(pixInTicket)).not.toThrow();

    const payinTickets = await api.getAveniaPayinTickets(fake.subaccountId);
    expect(() => aveniaPayinTicketsSchema.parse(payinTickets)).not.toThrow();

    const payoutTicket = await api.getAveniaPayoutTicket("pix-out-1", fake.subaccountId);
    expect(() => aveniaPayoutTicketSchema.parse(payoutTicket)).not.toThrow();
  });

  test("fake account limits, balances and info satisfy their contracts", async () => {
    const fake = new FakeBrla();
    const api = fake.asService();

    const limits = await api.getSubaccountUsedLimit(fake.subaccountId);
    expect(() => aveniaAccountLimitsSchema.parse(limits)).not.toThrow();

    const balances = await api.getAccountBalance(fake.subaccountId);
    expect(() => aveniaAccountBalanceSchema.parse(balances)).not.toThrow();

    const info = await api.subaccountInfo(fake.subaccountId);
    expect(() => aveniaAccountInfoSchema.parse(info)).not.toThrow();
  });
});

describe.skipIf(!RUN_LIVE || !HAS_CREDS)("Avenia external API contract — live", () => {
  const api = () => BrlaApiService.getInstance();

  test(
    "GET /quote/fixed-rate responses satisfy the quote contract (pay-in, transfer, payout)",
    async () => {
      const payInQuote = await runLive("avenia createPayInQuote", () => api().createPayInQuote(payInQuoteParams()));
      if (payInQuote) aveniaQuoteResponseSchema.parse(payInQuote);

      // Second production pay-in shape: internal BRLA moved to Moonbeam via permit.
      const transferQuote = await runLive("avenia createPayInQuote (moonbeam)", () =>
        api().createPayInQuote({
          blockchainSendMethod: BlockchainSendMethod.PERMIT,
          inputAmount: "100",
          inputCurrency: BrlaCurrency.BRLA,
          inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
          inputThirdParty: false,
          outputCurrency: BrlaCurrency.BRLA,
          outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
          outputThirdParty: false
        })
      );
      if (transferQuote) aveniaQuoteResponseSchema.parse(transferQuote);

      const payOutQuote = await runLive("avenia createPayOutQuote", () =>
        api().createPayOutQuote({ outputAmount: "50", outputThirdParty: false })
      );
      if (payOutQuote) aveniaQuoteResponseSchema.parse(payOutQuote);
    },
    60_000
  );

  test.skipIf(!SUBACCOUNT_ID)(
    "GET /account/limits, /balances and /account-info responses satisfy their contracts",
    async () => {
      const limits = await runLive("avenia getSubaccountUsedLimit", () => api().getSubaccountUsedLimit(SUBACCOUNT_ID as string));
      if (limits) aveniaAccountLimitsSchema.parse(limits);

      const balances = await runLive("avenia getAccountBalance", () => api().getAccountBalance(SUBACCOUNT_ID as string));
      if (balances) aveniaAccountBalanceSchema.parse(balances);

      const info = await runLive("avenia subaccountInfo", () => api().subaccountInfo(SUBACCOUNT_ID as string));
      if (info) {
        aveniaAccountInfoSchema.parse(info);
        // Piggy-back pix-key validation on the subaccount's own key — no separate fixture.
        if (info.pixKey) {
          const pixKeyData = await runLive("avenia validatePixKey", () => api().validatePixKey(info.pixKey));
          if (pixKeyData) aveniaPixKeyDataSchema.parse(pixKeyData);
        } else {
          console.warn("[contract:live] avenia validatePixKey skipped: subaccount has no pixKey");
        }
      }
    },
    60_000
  );

  test.skipIf(!SUBACCOUNT_ID)(
    "POST /account/tickets (PIX pay-in) + ticket listing satisfy their contracts (ticket expires unpaid)",
    async () => {
      const quote = await runLive("avenia pay-in quote (ticket)", () =>
        api().createPayInQuote(payInQuoteParams(SUBACCOUNT_ID))
      );
      if (!quote) return;

      const ticket = await runLive("avenia createPixInputTicket", () =>
        api().createPixInputTicket(
          {
            quoteToken: quote.quoteToken,
            ticketBlockchainOutput: { beneficiaryWalletId: "00000000-0000-0000-0000-000000000000" },
            ticketBrlPixInput: { additionalData: "contract-test" }
          },
          SUBACCOUNT_ID as string
        )
      );
      if (!ticket) return;
      aveniaPixInputTicketSchema.parse(ticket);

      const payinTickets = await runLive("avenia getAveniaPayinTickets", () => api().getAveniaPayinTickets(SUBACCOUNT_ID as string));
      if (!payinTickets) return;
      aveniaPayinTicketsSchema.parse(payinTickets);
      // The envelope/discriminator path is only exercised live through the real client;
      // our just-created ticket disappearing from the list would mean it drifted.
      expect(payinTickets.map(t => t.id)).toContain(ticket.id);
    },
    120_000
  );
});

// Not gated on HAS_CREDS: in the nightly (CONTRACT_EXPECT_LIVE=1) missing credentials
// are exactly the rot this must turn into a failure.
test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
