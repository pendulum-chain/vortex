/**
 * External API contract: Avenia/BRLA (docs/operations-testing.md).
 *
 * The same consumed-contract schemas run against the fake (hermetic, PR-blocking)
 * and against the partner API (live, nightly). Live tests skip cleanly when BRLA_*
 * credentials are absent; the subaccount-scoped tests additionally require a
 * pre-provisioned, KYC-approved sandbox subaccount (see .env.example):
 *
 *  - AVENIA_CONTRACT_SUBACCOUNT_ID
 *  - AVENIA_CONTRACT_WEBHOOK_URL (temporary webhook-management lifecycle)
 *
 * Per PRD, only one transaction (a PIX pay-in ticket, which expires unpaid) and
 * one temporary webhook are created per run. The webhook is deleted in `finally`.
 * Payout tickets are covered hermetically only — creating one live would move
 * BRLA balance, and reading one needs the id of a real payout.
 * `createOnchainSwapQuote`/`createOnchainSwapTicket`/`getMainAccountBalance`/
 * `getAveniaSwapTicket` have no production consumers and are deliberately uncovered.
 *
 * TODO: Add sandbox contract coverage for every consumed Avenia KYC/KYB operation and
 * complete flow, including documents, UBOs, API submissions, attempts, and status polling.
 */
import { randomUUID } from "node:crypto";
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
  AveniaWebhookSubscription,
  aveniaWebhookRegistrationSchema,
  aveniaWebhooksListSchema,
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
const WEBHOOK_URL = process.env.AVENIA_CONTRACT_WEBHOOK_URL;

if (RUN_LIVE && !HAS_CREDS) {
  console.warn("[contract:live] Avenia live half skipped: BRLA_API_KEY/BRLA_PRIVATE_KEY not set");
}
if (RUN_LIVE && HAS_CREDS && !WEBHOOK_URL) {
  console.warn("[contract:live] Avenia webhook lifecycle skipped: AVENIA_CONTRACT_WEBHOOK_URL not set");
}

async function requireLive<T>(label: string, call: () => Promise<T>): Promise<T> {
  const result = await runLive(label, call);
  if (result === null) {
    throw new Error(`${label} did not complete; webhook management has not been verified`);
  }
  return result;
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

  test.skipIf(!WEBHOOK_URL)(
    "POST + GET /notifications/webhooks register a webhook that can be deleted",
    async () => {
      const contractUrl = new URL(WEBHOOK_URL as string);
      contractUrl.searchParams.set("contractRun", randomUUID());
      const webhookUrl = contractUrl.toString();
      const subscriptions = [AveniaWebhookSubscription.All];
      let webhookId: string | null = null;

      try {
        const before = aveniaWebhooksListSchema.parse(
          await requireLive("avenia listWebhooks (before registration)", () => api().listWebhooks())
        );

        // A previous run that died between create and delete (runner crash, cancelled job)
        // leaks its webhook; with the hard 3-slot sandbox cap that would fail every later
        // run until someone cleans up by hand. Reclaim marked leftovers first.
        for (const stale of before.webhooks.filter(webhook => webhook.url.includes("contractRun="))) {
          console.warn(`[contract:live] deleting stale contract-test webhook ${stale.id} (${stale.url})`);
          await requireLive("avenia deleteWebhook (stale contract webhook)", () => api().deleteWebhook(stale.id));
        }

        const occupied = before.webhooks.filter(webhook => !webhook.url.includes("contractRun=")).length;
        if (occupied >= 3) {
          throw new Error(`Avenia sandbox already has ${occupied} webhooks; no free contract-test slot`);
        }

        const created = await requireLive("avenia createWebhook", () => api().createWebhook(webhookUrl, subscriptions));
        webhookId = typeof created.webhookId === "string" ? created.webhookId : null;
        const registration = aveniaWebhookRegistrationSchema.parse(created);
        webhookId = registration.webhookId;

        const after = aveniaWebhooksListSchema.parse(
          await requireLive("avenia listWebhooks (after registration)", () => api().listWebhooks())
        );
        expect(after.webhooks).toContainEqual(
          expect.objectContaining({ id: webhookId, subscriptions, url: webhookUrl })
        );
      } finally {
        if (!webhookId) {
          try {
            const current = aveniaWebhooksListSchema.parse(await api().listWebhooks());
            webhookId = current.webhooks.find(webhook => webhook.url === webhookUrl)?.id ?? null;
          } catch (error) {
            console.warn(
              `[contract:live] could not look up temporary Avenia webhook for cleanup: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        if (webhookId) {
          try {
            await api().deleteWebhook(webhookId);
          } catch (error) {
            // A throw here would mask the error that actually failed the test; the
            // stale-webhook sweep above reclaims the slot on the next run instead.
            console.warn(
              `[contract:live] could not delete temporary Avenia webhook ${webhookId}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    },
    60_000
  );
});

// Not gated on HAS_CREDS: in the nightly (CONTRACT_EXPECT_LIVE=1) missing credentials
// are exactly the rot this must turn into a failure.
test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
