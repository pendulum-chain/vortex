import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { WebhookEventType } from "@vortexfi/shared";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumConversionExecution, { MoneriumConversionExecutionStatus } from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import Webhook from "../../../models/webhook.model";
import WebhookDelivery from "../../../models/webhookDelivery.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import { NOTIFY_CONFIRMATION_DEPTH } from "./chain";
import { emitMoneriumDepositEvents } from "./manager-events";

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FALLBACK = "0x3333333333333333333333333333333333333333";
const MONERIUM_PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("monerium b2b manager events", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function setupAccountWithWebhook(events: WebhookEventType[]) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    const mapped = await provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      fallbackAddress: FALLBACK,
      forwarderAddress: FORWARDER,
      managerProfileId: manager.id,
      moneriumProfileId: MONERIUM_PROFILE
    });
    const webhook =
      events.length > 0
        ? await Webhook.create({
            events,
            isActive: true,
            partnerId: null,
            quoteId: null,
            sessionId: null,
            url: "https://manager.example.com/hook",
            userId: manager.id
          })
        : null;
    return { managerId: manager.id, mapped, webhook };
  }

  function depsAtBlock(block: bigint | null) {
    return { getBlockNumber: async () => block };
  }

  it("emits DEPOSIT_RECEIVED once per minted deposit and never for unattributed rows", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RECEIVED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "1000000000000000000",
      currency: "eur",
      moneriumOrderId: "unattr:1:0xdead:0",
      status: MoneriumFiatDepositStatus.Minted
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await emitMoneriumDepositEvents(depsAtBlock(null));

    const deliveries = await WebhookDelivery.findAll();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      eventId: `deposit-received:${deposit.id}`,
      eventType: WebhookEventType.DEPOSIT_RECEIVED,
      webhookId: webhook?.id
    });
    expect(deliveries[0].payload).toMatchObject({
      eventType: WebhookEventType.DEPOSIT_RECEIVED,
      payload: {
        accountId: mapped.accountId,
        amountRaw: "100000000000000000000",
        depositId: deposit.id,
        profileId: mapped.profileId,
        status: "minted",
        txHash: "0xmint"
      }
    });

    await deposit.reload();
    expect(deposit.receivedEventAt).not.toBeNull();
  });

  it("marks pending events emitted even without subscribers so history never replays", async () => {
    const { mapped } = await setupAccountWithWebhook([]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await deposit.reload();
    expect(deposit.receivedEventAt).not.toBeNull();
    expect(await WebhookDelivery.count()).toBe(0);
  });

  it("emits DEPOSIT_CONVERTED only at confirmation depth", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_CONVERTED]);
    const execution = await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1000,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      allocatedExecutionId: execution.id,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      receivedEventAt: new Date(),
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });

    // One block short of the depth: nothing emitted, marker untouched.
    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1000 + NOTIFY_CONFIRMATION_DEPTH - 1)));
    expect(await WebhookDelivery.count()).toBe(0);
    await deposit.reload();
    expect(deposit.convertedEventAt).toBeNull();

    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1000 + NOTIFY_CONFIRMATION_DEPTH)));
    const deliveries = await WebhookDelivery.findAll();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      eventId: `deposit-converted:${deposit.id}`,
      eventType: WebhookEventType.DEPOSIT_CONVERTED,
      webhookId: webhook?.id
    });
    expect(deliveries[0].payload).toMatchObject({
      payload: {
        conversion: { executionId: execution.id, txHash: "0xswap", usdcNetRaw: "108000000" },
        depositId: deposit.id
      }
    });
    await deposit.reload();
    expect(deposit.convertedEventAt).not.toBeNull();

    // Replay is a no-op.
    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1000 + NOTIFY_CONFIRMATION_DEPTH)));
    expect(await WebhookDelivery.count()).toBe(1);
  });

  it("only enqueues to the controlling manager's webhooks", async () => {
    const { mapped } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RECEIVED]);
    const otherManager = await createTestUser();
    await Webhook.create({
      events: [WebhookEventType.DEPOSIT_RECEIVED],
      isActive: true,
      partnerId: null,
      quoteId: null,
      sessionId: null,
      url: "https://other.example.com/hook",
      userId: otherManager.id
    });
    await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));

    const deliveries = await WebhookDelivery.findAll({ include: [{ as: "webhook", model: Webhook }] });
    expect(deliveries).toHaveLength(1);
    expect((deliveries[0] as WebhookDelivery & { webhook: Webhook }).webhook.url).toBe("https://manager.example.com/hook");
  });
});
