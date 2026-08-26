import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { WebhookEventType, type WebhookPayload } from "@vortexfi/shared";
import sequelize from "../../../config/database";
import Webhook from "../../../models/webhook.model";
import WebhookDelivery, { WebhookDeliveryStatus } from "../../../models/webhookDelivery.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import webhookDeliveryService from "./webhook-delivery.service";
import {
  dispatchDueWebhookDeliveries,
  enqueueWebhookDeliveries,
  pruneSettledWebhookDeliveries,
  reconcileStuckWebhookDeliveries
} from "./webhook-outbox.service";

const realDeliverSingleAttempt = webhookDeliveryService.deliverSingleAttempt.bind(webhookDeliveryService);
let deliverResults: Array<{ ok: boolean; error: string | null }> = [];
let deliverCalls: Array<{ url: string; payload: WebhookPayload }> = [];

function payloadFor(eventId: string): WebhookPayload {
  return {
    eventId,
    eventType: WebhookEventType.DEPOSIT_RECEIVED,
    payload: {
      accountId: "acc-1",
      amountRaw: "100000000000000000000",
      currency: "eur",
      depositId: "dep-1",
      profileId: "profile-1",
      status: "minted",
      txHash: null
    },
    timestamp: new Date().toISOString()
  } as WebhookPayload;
}

describe("webhook delivery outbox", () => {
  beforeAll(async () => {
    await setupTestDatabase();
    webhookDeliveryService.deliverSingleAttempt = async (webhook, payload) => {
      deliverCalls.push({ payload, url: webhook.url });
      return deliverResults.shift() ?? { error: "no scripted result", ok: false };
    };
  });

  afterAll(() => {
    webhookDeliveryService.deliverSingleAttempt = realDeliverSingleAttempt;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    deliverResults = [];
    deliverCalls = [];
  });

  async function createDepositWebhook(): Promise<Webhook> {
    const owner = await createTestUser();
    return Webhook.create({
      events: [WebhookEventType.DEPOSIT_RECEIVED, WebhookEventType.DEPOSIT_CONVERTED],
      isActive: true,
      partnerId: null,
      quoteId: null,
      sessionId: null,
      url: "https://integrator.example.com/hook",
      userId: owner.id
    });
  }

  it("enqueues idempotently per (webhook, event)", async () => {
    const webhook = await createDepositWebhook();
    const payload = payloadFor("deposit-received:dep-1");

    await enqueueWebhookDeliveries([webhook], payload);
    await enqueueWebhookDeliveries([webhook], payload);

    expect(await WebhookDelivery.count()).toBe(1);
  });

  it("dispatches a due delivery and records the sent outcome", async () => {
    const webhook = await createDepositWebhook();
    await enqueueWebhookDeliveries([webhook], payloadFor("deposit-received:dep-1"));
    deliverResults = [{ error: null, ok: true }];

    expect(await dispatchDueWebhookDeliveries()).toBe(1);

    const row = await WebhookDelivery.findOne({ where: { webhookId: webhook.id } });
    expect(row?.status).toBe(WebhookDeliveryStatus.Sent);
    expect(row?.attempts).toBe(1);
    expect(row?.sentAt).not.toBeNull();
    expect(deliverCalls).toHaveLength(1);
    expect(deliverCalls[0].url).toBe("https://integrator.example.com/hook");
  });

  it("retries with backoff and abandons after the attempt cap", async () => {
    const webhook = await createDepositWebhook();
    await enqueueWebhookDeliveries([webhook], payloadFor("deposit-received:dep-1"));

    for (let attempt = 1; attempt <= 6; attempt++) {
      deliverResults = [{ error: "HTTP 500", ok: false }];
      // Force the row due again regardless of the recorded backoff.
      await WebhookDelivery.update({ nextAttemptAt: new Date(Date.now() - 1000) }, { where: { webhookId: webhook.id } });
      await dispatchDueWebhookDeliveries();

      const row = await WebhookDelivery.findOne({ where: { webhookId: webhook.id } });
      if (attempt < 6) {
        expect(row?.status).toBe(WebhookDeliveryStatus.Pending);
        expect(row?.attempts).toBe(attempt);
        expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
        expect(row?.lastError).toBe("HTTP 500");
      } else {
        expect(row?.status).toBe(WebhookDeliveryStatus.Abandoned);
      }
    }

    // Abandoned rows are terminal — nothing further is claimed.
    deliverResults = [{ error: null, ok: true }];
    await WebhookDelivery.update({ nextAttemptAt: new Date(Date.now() - 1000) }, { where: { webhookId: webhook.id } });
    expect(await dispatchDueWebhookDeliveries()).toBe(0);
  });

  it("abandons deliveries whose webhook is gone or inactive without deactivating others", async () => {
    const webhook = await createDepositWebhook();
    await enqueueWebhookDeliveries([webhook], payloadFor("deposit-received:dep-1"));
    await webhook.update({ isActive: false });

    await dispatchDueWebhookDeliveries();

    const row = await WebhookDelivery.findOne({ where: { webhookId: webhook.id } });
    expect(row?.status).toBe(WebhookDeliveryStatus.Abandoned);
    expect(deliverCalls).toHaveLength(0);
  });

  it("never double-delivers under concurrent dispatch (skip-locked claims)", async () => {
    const webhook = await createDepositWebhook();
    for (let i = 0; i < 10; i++) {
      await enqueueWebhookDeliveries([webhook], payloadFor(`deposit-received:dep-${i}`));
    }
    deliverResults = Array.from({ length: 20 }, () => ({ error: null, ok: true }));

    // Two dispatchers race for the same due backlog; SKIP LOCKED must partition it.
    await Promise.all([dispatchDueWebhookDeliveries(), dispatchDueWebhookDeliveries()]);
    while ((await dispatchDueWebhookDeliveries()) > 0) {
      // drain any remainder
    }

    expect(deliverCalls).toHaveLength(10);
    expect(await WebhookDelivery.count({ where: { status: WebhookDeliveryStatus.Sent } })).toBe(10);
  });

  it("requeues stuck sending rows so a crash cannot strand a delivery", async () => {
    const webhook = await createDepositWebhook();
    await enqueueWebhookDeliveries([webhook], payloadFor("deposit-received:dep-1"));
    await WebhookDelivery.update(
      { status: WebhookDeliveryStatus.Sending, updatedAt: new Date(Date.now() - 16 * 60 * 1000) },
      { silent: true, where: { webhookId: webhook.id } }
    );

    expect(await reconcileStuckWebhookDeliveries()).toBe(1);
    const row = await WebhookDelivery.findOne({ where: { webhookId: webhook.id } });
    expect(row?.status).toBe(WebhookDeliveryStatus.Pending);
  });
});

describe("settled delivery retention", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("prunes old sent rows and keeps pending and recent ones", async () => {
    const owner = await createTestUser();
    const webhook = await Webhook.create({
      events: [WebhookEventType.DEPOSIT_RECEIVED],
      isActive: true,
      partnerId: null,
      quoteId: null,
      sessionId: null,
      url: "https://integrator.example.com/hook",
      userId: owner.id
    });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await WebhookDelivery.bulkCreate([
      { eventId: "old-sent", eventType: "DEPOSIT_RECEIVED", payload: payloadFor("old-sent"), sentAt: old, status: WebhookDeliveryStatus.Sent, webhookId: webhook.id },
      { eventId: "fresh-sent", eventType: "DEPOSIT_RECEIVED", payload: payloadFor("fresh-sent"), sentAt: new Date(), status: WebhookDeliveryStatus.Sent, webhookId: webhook.id },
      { eventId: "old-pending", eventType: "DEPOSIT_RECEIVED", payload: payloadFor("old-pending"), webhookId: webhook.id }
    ]);
    await sequelize.query("UPDATE webhook_deliveries SET updated_at = :old WHERE event_id IN ('old-sent', 'old-pending')", {
      replacements: { old }
    });

    expect(await pruneSettledWebhookDeliveries()).toBe(1);
    const remaining = (await WebhookDelivery.findAll()).map(row => row.eventId).sort();
    expect(remaining).toEqual(["fresh-sent", "old-pending"]);
  });
});
