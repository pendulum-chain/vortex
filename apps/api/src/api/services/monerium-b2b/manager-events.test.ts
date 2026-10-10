import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { WebhookEventType } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumRecovery, { MoneriumRecoveryPhase } from "../../../models/moneriumRecovery.model";
import Webhook from "../../../models/webhook.model";
import WebhookDelivery from "../../../models/webhookDelivery.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import { NOTIFY_CONFIRMATION_DEPTH } from "./chain";
import { markDepositForRecovery } from "./conversion-executor";
import { emitMoneriumDepositEvents, maskIban } from "./manager-events";
import { setDepositStatus } from "./recovery";

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const MONERIUM_PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";

describe("monerium b2b manager events", () => {
  let originalRpcUrl: string | undefined;

  beforeAll(async () => {
    originalRpcUrl = config.moneriumB2b.rpcUrl;
    config.moneriumB2b.rpcUrl = undefined;
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.rpcUrl = originalRpcUrl;
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
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
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
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await deposit.reload();
    expect(deposit.receivedEventAt).not.toBeNull();
    expect(await WebhookDelivery.count()).toBe(0);
  });

  it("does not emit DEPOSIT_RECEIVED from a provider claim without chain identity", async () => {
    const { mapped } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RECEIVED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xprovider-claim"
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await deposit.reload();
    expect(deposit.receivedEventAt).toBeNull();
    expect(await WebhookDelivery.count()).toBe(0);
  });

  it("emits DEPOSIT_RECEIVED for a deposit the keeper already started converting", async () => {
    const { mapped } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RECEIVED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Converting,
      txHash: "0xmint"
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    const deliveries = await WebhookDelivery.findAll();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].payload).toMatchObject({ payload: { depositId: deposit.id, status: "converting" } });
  });

  it("emits one DEPOSIT_CONVERTED with every chunk once the forward reaches confirmation depth", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_CONVERTED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      blockNumber: 999,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      receivedEventAt: new Date(),
      status: MoneriumFiatDepositStatus.Converting,
      txHash: "0xmint"
    });
    const firstExecution = await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1000,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "60000000000000000000",
      feeRaw: "81000",
      referenceRateRaw: "108140000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      subsidyRaw: "0",
      txHash: "0xswap1",
      usdcNetRaw: "64800000"
    });
    const secondExecution = await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1001,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "40000000000000000000",
      feeRaw: "0",
      referenceRateRaw: "108120000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      subsidyRaw: "120000",
      txHash: "0xswap2",
      usdcNetRaw: "43200000"
    });

    // Converted but not forwarded: the partner must not see a final event yet.
    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1001 + NOTIFY_CONFIRMATION_DEPTH)));
    expect(await WebhookDelivery.count()).toBe(0);

    await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1002,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      kind: MoneriumConversionExecutionKind.Forward,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xforward",
      usdcNetRaw: "108000000"
    });
    await deposit.update({ status: MoneriumFiatDepositStatus.Forwarded });

    // One block short of the depth: nothing emitted, marker untouched.
    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1002 + NOTIFY_CONFIRMATION_DEPTH - 1)));
    expect(await WebhookDelivery.count()).toBe(0);
    await deposit.reload();
    expect(deposit.convertedEventAt).toBeNull();

    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1002 + NOTIFY_CONFIRMATION_DEPTH)));
    const deliveries = await WebhookDelivery.findAll();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      eventId: `deposit-converted:${deposit.id}`,
      eventType: WebhookEventType.DEPOSIT_CONVERTED,
      webhookId: webhook?.id
    });
    expect(deliveries[0].payload).toMatchObject({
      payload: {
        conversions: [
          {
            eureInRaw: "60000000000000000000",
            execution: { feeRaw: "81000", referenceRateRaw: "108140000", subsidyRaw: "0" },
            executionId: firstExecution.id,
            txHash: "0xswap1",
            usdcNetRaw: "64800000"
          },
          {
            eureInRaw: "40000000000000000000",
            execution: { feeRaw: "0", referenceRateRaw: "108120000", subsidyRaw: "120000" },
            executionId: secondExecution.id,
            txHash: "0xswap2",
            usdcNetRaw: "43200000"
          }
        ],
        depositId: deposit.id,
        forwardTxHash: "0xforward",
        status: "forwarded",
        usdcNetRaw: "108000000"
      }
    });
    await deposit.reload();
    expect(deposit.convertedEventAt).not.toBeNull();

    // Replay is a no-op.
    await emitMoneriumDepositEvents(depsAtBlock(BigInt(1002 + NOTIFY_CONFIRMATION_DEPTH)));
    expect(await WebhookDelivery.count()).toBe(1);
  });

  it("emits DEPOSIT_RETURNED once a deposit was refunded, with the refund facts and a masked IBAN", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RETURNED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      blockNumber: 999,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      payerIban: "DE89370400440532013000",
      payerName: "Payer GmbH",
      receivedEventAt: new Date(),
      status: MoneriumFiatDepositStatus.Refunded,
      txHash: "0xmint"
    });
    await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      kind: MoneriumConversionExecutionKind.Recover,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xrecover",
      usdcNetRaw: "0"
    });
    await MoneriumRecovery.create({
      depositId: deposit.id,
      eureRecoveredRaw: "100000000000000000000",
      phase: MoneriumRecoveryPhase.Redeemed,
      redeemOrderId: "order-redeem-1",
      refundAmount: "100.00",
      usdcRecoveredRaw: "0"
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await emitMoneriumDepositEvents(depsAtBlock(null));
    const deliveries = await WebhookDelivery.findAll();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ eventId: `deposit-returned:${deposit.id}`, webhookId: webhook?.id });
    expect(deliveries[0].payload).toMatchObject({
      eventType: WebhookEventType.DEPOSIT_RETURNED,
      payload: {
        depositId: deposit.id,
        refund: { amount: "100.00", payerIbanMasked: "DE89…3000", recoverTxHash: "0xrecover", redeemOrderId: "order-redeem-1" },
        status: "refunded"
      }
    });
    await deposit.reload();
    expect(deposit.returnedEventAt).not.toBeNull();
    expect(maskIban("EE08 7224 5745 6244 9516")).toBe("EE08…9516");
  });

  it("reports a refund closed by hand as refunded at its refunded transition", async () => {
    const { mapped } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_RETURNED, WebhookEventType.DEPOSIT_UPDATED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "500000000000000000",
      blockNumber: 999,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      payerIban: "DE89370400440532013000",
      receivedEventAt: new Date(),
      refundReason: "window_missed",
      refundStartedAt: new Date(),
      status: MoneriumFiatDepositStatus.Recovering,
      txHash: "0xmint"
    });
    // The admin PATCH path: no recover execution, no MoneriumRecovery row.
    expect(await setDepositStatus(deposit, MoneriumFiatDepositStatus.Refunded)).toBeNull();
    await deposit.reload();
    const refundedAt = deposit.updatedAt.toISOString();
    await new Promise(resolve => setTimeout(resolve, 5));

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await emitMoneriumDepositEvents(depsAtBlock(null));
    const updates = (await WebhookDelivery.findAll())
      .map(delivery => delivery.payload as unknown as { eventType: string; payload: Record<string, unknown> })
      .filter(payload => payload.eventType === WebhookEventType.DEPOSIT_UPDATED);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      refund: { recoverTxHash: null, redeemOrderId: null, refundedAt },
      status: "refunded"
    });
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
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });

    await emitMoneriumDepositEvents(depsAtBlock(null));

    const deliveries = await WebhookDelivery.findAll({ include: [{ as: "webhook", model: Webhook }] });
    expect(deliveries).toHaveLength(1);
    expect((deliveries[0] as WebhookDelivery & { webhook: Webhook }).webhook.url).toBe("https://manager.example.com/hook");
  });

  it("sends DEPOSIT_UPDATED with the full snapshot on every change, and only then", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_UPDATED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      currency: "eur",
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Pending
    });
    const snapshots = async () =>
      (await WebhookDelivery.findAll({ order: [["created_at", "ASC"]] })).map(delivery => {
        expect(delivery.webhookId).toBe(webhook?.id as string);
        return (delivery.payload as unknown as { payload: Record<string, unknown> }).payload;
      });

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await emitMoneriumDepositEvents(depsAtBlock(null));
    expect(await snapshots()).toHaveLength(1);
    expect((await snapshots())[0]).toMatchObject({
      amount: "100.00",
      depositId: deposit.id,
      externalSubjectId: "client-1",
      moneriumOrderId: "order-1",
      moneriumProfileId: MONERIUM_PROFILE,
      profileId: mapped.profileId,
      refund: null,
      status: "pending",
      waiting: { reason: "monerium_pending" }
    });

    // Minted, then held by the keeper on the market: two more snapshots.
    await deposit.update({
      blockNumber: 100,
      chainId: 11155111,
      logIndex: 1,
      mintedAt: new Date(),
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    await emitMoneriumDepositEvents(depsAtBlock(null));
    await deposit.update({ waitingReason: "below_floor", waitingSince: new Date() });
    await emitMoneriumDepositEvents(depsAtBlock(null));
    let sent = await snapshots();
    expect(sent).toHaveLength(3);
    expect(sent[1]).toMatchObject({ status: "minted", txHash: "0xmint", waiting: null });
    expect(sent[2]).toMatchObject({ status: "minted", waiting: { reason: "below_floor" } });

    // The refund path carries its reason and start time; the market hold no longer applies.
    expect(await markDepositForRecovery(deposit.id, "window_missed")).toBeNull();
    await emitMoneriumDepositEvents(depsAtBlock(null));
    sent = await snapshots();
    expect(sent).toHaveLength(4);
    expect(sent[3]).toMatchObject({
      refund: { amount: "100.00", reason: "window_missed", startedAt: expect.any(String) },
      status: "recovering",
      waiting: null
    });
    const eventIds = (await WebhookDelivery.findAll()).map(delivery => delivery.eventId);
    expect(new Set(eventIds).size).toBe(4);
  });

  it("reports a forwarded deposit through DEPOSIT_UPDATED only at confirmation depth", async () => {
    const { mapped } = await setupAccountWithWebhook([WebhookEventType.DEPOSIT_UPDATED]);
    const deposit = await MoneriumFiatDeposit.create({
      accountId: mapped.accountId,
      amountRaw: "100000000000000000000",
      blockNumber: 999,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      moneriumOrderId: "order-1",
      status: MoneriumFiatDepositStatus.Converting,
      txHash: "0xmint"
    });
    await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1000,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      feeRaw: "0",
      referenceRateRaw: "108140000",
      status: MoneriumConversionExecutionStatus.Confirmed,
      subsidyRaw: "0",
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    await emitMoneriumDepositEvents(depsAtBlock(null));
    await MoneriumConversionExecution.create({
      accountId: mapped.accountId,
      blockNumber: 1001,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: "100000000000000000000",
      kind: MoneriumConversionExecutionKind.Forward,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xforward",
      usdcNetRaw: "108000000"
    });
    await deposit.update({ status: MoneriumFiatDepositStatus.Forwarded });

    await emitMoneriumDepositEvents(depsAtBlock(1001n));
    expect(await WebhookDelivery.count()).toBe(1);
    await emitMoneriumDepositEvents(depsAtBlock(1001n + BigInt(NOTIFY_CONFIRMATION_DEPTH)));
    await emitMoneriumDepositEvents(depsAtBlock(1001n + BigInt(NOTIFY_CONFIRMATION_DEPTH)));
    const deliveries = await WebhookDelivery.findAll({ order: [["created_at", "ASC"]] });
    expect(deliveries).toHaveLength(2);
    expect((deliveries[1].payload as { payload: unknown }).payload).toMatchObject({
      conversions: [{ confirmedAt: expect.any(String), status: "confirmed", txHash: "0xswap", usdcNetRaw: "108000000" }],
      deliveredAt: expect.any(String),
      forwardTxHash: "0xforward",
      status: "forwarded",
      usdcNetRaw: "108000000"
    });
  });

  it("sends ACCOUNT_UPDATED when the account snapshot changes", async () => {
    const { mapped, webhook } = await setupAccountWithWebhook([WebhookEventType.ACCOUNT_UPDATED]);

    await emitMoneriumDepositEvents(depsAtBlock(null));
    await emitMoneriumDepositEvents(depsAtBlock(null));
    await MoneriumAccount.update({ iban: "EE123456789012345678" }, { where: { id: mapped.accountId } });
    await emitMoneriumDepositEvents(depsAtBlock(null));

    const deliveries = await WebhookDelivery.findAll({ order: [["created_at", "ASC"]] });
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every(delivery => delivery.webhookId === webhook?.id)).toBe(true);
    expect((deliveries[0].payload as { payload: unknown }).payload).toMatchObject({
      accountId: mapped.accountId,
      externalSubjectId: "client-1",
      iban: null,
      moneriumProfileId: MONERIUM_PROFILE,
      profileId: mapped.profileId
    });
    expect((deliveries[1].payload as { payload: unknown }).payload).toMatchObject({ iban: "EE123456789012345678" });
  });
});
