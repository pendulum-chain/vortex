import { createHash } from "node:crypto";
import {
  type AccountSnapshot,
  type ConversionExecutionPricing,
  type DepositRefundReason,
  type DepositSnapshot,
  DepositStatus,
  type DepositWaitingReason,
  type DepositWebhookPayloadBase,
  WebhookEventType,
  type WebhookPayload
} from "@vortexfi/shared";
import { Op } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ManagedProfile from "../../../models/managedProfile.model";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumRecovery from "../../../models/moneriumRecovery.model";
import webhookService from "../webhook/webhook.service";
import { enqueueWebhookDeliveries } from "../webhook/webhook-outbox.service";
import { getPublicClient, NOTIFY_CONFIRMATION_DEPTH } from "./chain";
import { UNATTRIBUTED_ORDER_PREFIX } from "./mint-watcher";

const BATCH_LIMIT = 100;

export interface ManagerEventDeps {
  /** Current chain head, or null when no read RPC is configured. */
  getBlockNumber(): Promise<bigint | null>;
}

const defaultDeps: ManagerEventDeps = {
  async getBlockNumber() {
    if (!config.moneriumB2b.rpcUrl) return null;
    return getPublicClient().getBlockNumber();
  }
};

/** First and last four characters of an IBAN, for partner-facing payloads. */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, "");
  return compact.length <= 8 ? compact : `${compact.slice(0, 4)}…${compact.slice(-4)}`;
}

/** Execution-level pricing facts, identical on every deposit portion the execution consumed. */
export function executionPricing(execution: MoneriumConversionExecution): ConversionExecutionPricing {
  return {
    feeRaw: execution.feeRaw,
    referenceRateRaw: execution.referenceRateRaw,
    subsidyRaw: execution.subsidyRaw
  };
}

function depositPayloadBase(deposit: MoneriumFiatDeposit, account: MoneriumAccount): DepositWebhookPayloadBase {
  return {
    accountId: account.id,
    amountRaw: deposit.amountRaw,
    currency: deposit.currency,
    depositId: deposit.id,
    profileId: account.vortexProfileId as string,
    status: deposit.status as unknown as DepositStatus,
    txHash: deposit.txHash
  };
}

/**
 * The active managed relationship behind an account: its controlling manager and the
 * partner's client reference. Null when the account is unmapped or the relationship is
 * gone; events are then marked emitted with no deliveries, so history is never replayed
 * to late subscribers.
 */
export async function findRelationship(account: MoneriumAccount): Promise<ManagedProfile | null> {
  if (!account.vortexProfileId) return null;
  return ManagedProfile.findOne({ where: { profileId: account.vortexProfileId, status: "active" } });
}

async function resolveManagerProfileId(account: MoneriumAccount): Promise<string | null> {
  return (await findRelationship(account))?.managerProfileId ?? null;
}

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

export function accountSnapshot(account: MoneriumAccount, relationship: ManagedProfile | null | undefined): AccountSnapshot {
  return {
    accountId: account.id,
    createdAt: account.createdAt.toISOString(),
    destination: account.destination,
    dormantSince: iso(account.dormantSince),
    externalSubjectId: relationship?.externalSubjectId ?? null,
    floorPpm: account.floorPpm,
    forwarderAddress: account.forwarderAddress,
    iban: account.iban,
    moneriumProfileId: account.profileId,
    profileId: account.vortexProfileId,
    status: account.status,
    targetPpm: account.targetPpm
  };
}

function waitingOf(deposit: MoneriumFiatDeposit): DepositSnapshot["waiting"] {
  if (deposit.status === MoneriumFiatDepositStatus.Pending || deposit.status === MoneriumFiatDepositStatus.Held) {
    return { reason: "monerium_pending", since: deposit.createdAt.toISOString() };
  }
  const converting =
    deposit.status === MoneriumFiatDepositStatus.Minted || deposit.status === MoneriumFiatDepositStatus.Converting;
  if (!converting || !deposit.waitingReason) return null;
  return {
    reason: deposit.waitingReason as DepositWaitingReason,
    since: iso(deposit.waitingSince) ?? deposit.createdAt.toISOString()
  };
}

/** A confirmed execution row is terminal, so its last update is its confirmation. */
const confirmedAt = (execution: MoneriumConversionExecution): string | null =>
  execution.status === MoneriumConversionExecutionStatus.Confirmed ? execution.updatedAt.toISOString() : null;

/**
 * Snapshots of one account's deposits, in the given order. The deposits endpoint and the
 * DEPOSIT_UPDATED event share this shape.
 */
export async function depositSnapshots(
  account: MoneriumAccount,
  relationship: ManagedProfile | null | undefined,
  deposits: MoneriumFiatDeposit[]
): Promise<DepositSnapshot[]> {
  if (deposits.length === 0) return [];
  const depositIds = deposits.map(deposit => deposit.id);
  const [executions, recoveries] = await Promise.all([
    MoneriumConversionExecution.findAll({
      order: [["created_at", "ASC"]],
      where: { depositId: depositIds, status: { [Op.ne]: MoneriumConversionExecutionStatus.Failed } }
    }),
    MoneriumRecovery.findAll({ where: { depositId: depositIds } })
  ]);
  return deposits.map(deposit => {
    const own = executions.filter(execution => execution.depositId === deposit.id);
    const confirmed = (kind: MoneriumConversionExecutionKind) =>
      own.find(execution => execution.kind === kind && execution.status === MoneriumConversionExecutionStatus.Confirmed);
    const swaps = own.filter(execution => execution.kind === MoneriumConversionExecutionKind.Swap);
    const forward = confirmed(MoneriumConversionExecutionKind.Forward);
    const recover = confirmed(MoneriumConversionExecutionKind.Recover);
    const recovery = recoveries.find(row => row.depositId === deposit.id);
    return {
      accountId: account.id,
      amount: eurAmountFromRaw(deposit.amountRaw),
      amountRaw: deposit.amountRaw,
      conversions: swaps.map(execution => ({
        confirmedAt: confirmedAt(execution),
        eureInRaw: execution.eureInRaw,
        execution: executionPricing(execution),
        executionId: execution.id,
        sentAt: execution.createdAt.toISOString(),
        status: execution.status as "pending" | "confirmed",
        txHash: execution.txHash,
        usdcNetRaw: execution.usdcNetRaw ?? "0"
      })),
      currency: deposit.currency,
      deliveredAt: forward ? confirmedAt(forward) : null,
      depositId: deposit.id,
      externalSubjectId: relationship?.externalSubjectId ?? null,
      forwardTxHash: forward?.txHash ?? null,
      mintedAt: iso(deposit.mintedAt),
      moneriumOrderId: deposit.moneriumOrderId,
      moneriumProfileId: account.profileId,
      profileId: account.vortexProfileId as string,
      receivedAt: deposit.createdAt.toISOString(),
      refund:
        deposit.refundStartedAt || recovery || recover
          ? {
              amount: recovery?.refundAmount ?? eurAmountFromRaw(deposit.amountRaw),
              payerIbanMasked: deposit.payerIban ? maskIban(deposit.payerIban) : null,
              reason: deposit.refundReason as DepositRefundReason | null,
              recoverTxHash: recover?.txHash ?? null,
              redeemOrderId: recovery?.redeemOrderId ?? null,
              // Dated by the deposit's refunded transition, its last write (the received/returned markers
              // are silent, the status is terminal): the orchestrator closes the recovery row after it, or
              // a cycle later for a refund closed by hand, so that row's time would drift between snapshots.
              refundedAt: deposit.status === MoneriumFiatDepositStatus.Refunded ? iso(deposit.updatedAt) : null,
              startedAt: iso(deposit.refundStartedAt)
            }
          : null,
      rejectedReason: deposit.rejectedReason,
      status: deposit.status as unknown as DepositStatus,
      txHash: deposit.txHash,
      usdcNetRaw: swaps
        .filter(execution => execution.status === MoneriumConversionExecutionStatus.Confirmed)
        .reduce((sum, execution) => sum + BigInt(execution.usdcNetRaw ?? "0"), 0n)
        .toString(),
      waiting: waitingOf(deposit)
    };
  });
}

const snapshotHash = (snapshot: AccountSnapshot | DepositSnapshot): string =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

async function enqueueForManager(
  eventType: WebhookEventType,
  managerProfileId: string | null,
  payload: WebhookPayload
): Promise<number> {
  if (!managerProfileId) return 0;
  const webhooks = await webhookService.findAccountEventWebhooks(eventType, managerProfileId);
  await enqueueWebhookDeliveries(webhooks, payload);
  return webhooks.length;
}

async function emitReceivedEvents(): Promise<void> {
  const deposits = await MoneriumFiatDeposit.findAll({
    limit: BATCH_LIMIT,
    order: [["created_at", "ASC"]],
    where: {
      blockNumber: { [Op.ne]: null },
      chainId: { [Op.ne]: null },
      logIndex: { [Op.ne]: null },
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      receivedEventAt: null,
      // Any state past the mint: the keeper may have started converting within the cycle.
      status: {
        [Op.notIn]: [MoneriumFiatDepositStatus.Pending, MoneriumFiatDepositStatus.Held, MoneriumFiatDepositStatus.Returned]
      },
      txHash: { [Op.ne]: null }
    }
  });

  for (const deposit of deposits) {
    try {
      const account = await MoneriumAccount.findByPk(deposit.accountId);
      if (!account) continue;
      const managerProfileId = await resolveManagerProfileId(account);
      const payload: WebhookPayload = {
        eventId: `deposit-received:${deposit.id}`,
        eventType: WebhookEventType.DEPOSIT_RECEIVED,
        payload: depositPayloadBase(deposit, account),
        timestamp: new Date().toISOString()
      };
      await enqueueForManager(WebhookEventType.DEPOSIT_RECEIVED, managerProfileId, payload);
      // Marked emitted even with zero subscribers: webhooks are forward-looking, a
      // later registration must not receive the whole history. A crash between the
      // enqueue and this marker is absorbed by the outbox (webhook_id, event_id) dedup.
      // Silent: updated_at is a refunded deposit's refundedAt fallback.
      await deposit.update({ receivedEventAt: new Date() }, { silent: true });
    } catch (error) {
      // Per-deposit isolation: one failing deposit must not block its siblings.
      logger.error(`monerium-b2b: DEPOSIT_RECEIVED emission failed for deposit ${deposit.id}:`, error);
    }
  }
}

async function emitConvertedEvents(deps: ManagerEventDeps): Promise<void> {
  const deposits = await MoneriumFiatDeposit.findAll({
    limit: BATCH_LIMIT,
    order: [["created_at", "ASC"]],
    where: {
      convertedEventAt: null,
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      status: MoneriumFiatDepositStatus.Forwarded
    }
  });
  if (deposits.length === 0) return;

  const head = await deps.getBlockNumber();
  if (head === null) return; // no read RPC: emit once the chain is configured

  for (const deposit of deposits) {
    try {
      await emitConvertedEventForDeposit(deposit, head);
    } catch (error) {
      logger.error(`monerium-b2b: DEPOSIT_CONVERTED emission failed for deposit ${deposit.id}:`, error);
    }
  }
}

async function emitConvertedEventForDeposit(deposit: MoneriumFiatDeposit, head: bigint): Promise<void> {
  const executions = await MoneriumConversionExecution.findAll({
    order: [["created_at", "ASC"]],
    where: { depositId: deposit.id, status: MoneriumConversionExecutionStatus.Confirmed }
  });
  const forward = executions.find(execution => execution.kind === MoneriumConversionExecutionKind.Forward);
  const swaps = executions.filter(execution => execution.kind === MoneriumConversionExecutionKind.Swap);
  if (!forward || swaps.length === 0) return;
  // Confirmation-depth gate (plan §3, registry P9): only notify once the forward is
  // NOTIFY_CONFIRMATION_DEPTH blocks below the head, so a shallow reorg cannot produce a
  // delivered-then-vanished conversion event. The chunks precede the forward by construction.
  if (forward.blockNumber === null || head < BigInt(forward.blockNumber) + BigInt(NOTIFY_CONFIRMATION_DEPTH)) {
    return;
  }

  const account = await MoneriumAccount.findByPk(deposit.accountId);
  if (!account) return;
  const managerProfileId = await resolveManagerProfileId(account);
  const payload: WebhookPayload = {
    eventId: `deposit-converted:${deposit.id}`,
    eventType: WebhookEventType.DEPOSIT_CONVERTED,
    payload: {
      ...depositPayloadBase(deposit, account),
      conversions: swaps.map(execution => ({
        eureInRaw: execution.eureInRaw,
        execution: executionPricing(execution),
        executionId: execution.id,
        txHash: execution.txHash,
        usdcNetRaw: execution.usdcNetRaw ?? "0"
      })),
      forwardTxHash: forward.txHash,
      usdcNetRaw: forward.usdcNetRaw ?? "0"
    },
    timestamp: new Date().toISOString()
  };
  await enqueueForManager(WebhookEventType.DEPOSIT_CONVERTED, managerProfileId, payload);
  await deposit.update({ convertedEventAt: new Date() });
}

async function emitReturnedEvents(): Promise<void> {
  const deposits = await MoneriumFiatDeposit.findAll({
    limit: BATCH_LIMIT,
    order: [["created_at", "ASC"]],
    where: {
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      returnedEventAt: null,
      status: MoneriumFiatDepositStatus.Refunded
    }
  });
  for (const deposit of deposits) {
    try {
      const account = await MoneriumAccount.findByPk(deposit.accountId);
      if (!account) continue;
      const [recovery, recoverExecution] = await Promise.all([
        MoneriumRecovery.findOne({ where: { depositId: deposit.id } }),
        MoneriumConversionExecution.findOne({
          where: {
            depositId: deposit.id,
            kind: MoneriumConversionExecutionKind.Recover,
            status: MoneriumConversionExecutionStatus.Confirmed
          }
        })
      ]);
      const managerProfileId = await resolveManagerProfileId(account);
      const payload: WebhookPayload = {
        eventId: `deposit-returned:${deposit.id}`,
        eventType: WebhookEventType.DEPOSIT_RETURNED,
        payload: {
          ...depositPayloadBase(deposit, account),
          refund: {
            amount: recovery?.refundAmount ?? eurAmountFromRaw(deposit.amountRaw),
            payerIbanMasked: deposit.payerIban ? maskIban(deposit.payerIban) : "",
            recoverTxHash: recoverExecution?.txHash ?? null,
            redeemOrderId: recovery?.redeemOrderId ?? null
          }
        },
        timestamp: new Date().toISOString()
      };
      await enqueueForManager(WebhookEventType.DEPOSIT_RETURNED, managerProfileId, payload);
      // Silent: updated_at stays the refunded transition, the refundedAt fallback below.
      await deposit.update({ returnedEventAt: new Date() }, { silent: true });
    } catch (error) {
      logger.error(`monerium-b2b: DEPOSIT_RETURNED emission failed for deposit ${deposit.id}:`, error);
    }
  }
}

/** An 18-decimal EUR amount to the cent ("1234.56"). */
function eurAmountFromRaw(amountRaw: string): string {
  const cents = BigInt(amountRaw) / 10n ** 16n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const SETTLED_STATUSES = [
  MoneriumFiatDepositStatus.Forwarded,
  MoneriumFiatDepositStatus.Returned,
  MoneriumFiatDepositStatus.Refunded
];

/** Same depth gate as DEPOSIT_CONVERTED: "forwarded" is reported once the forward cannot reorg away. */
async function forwardIsDeep(depositId: string, head: bigint | null): Promise<boolean> {
  if (head === null) return false;
  const forward = await MoneriumConversionExecution.findOne({
    where: {
      depositId,
      kind: MoneriumConversionExecutionKind.Forward,
      status: MoneriumConversionExecutionStatus.Confirmed
    }
  });
  return (
    forward?.blockNumber !== null &&
    forward?.blockNumber !== undefined &&
    head >= BigInt(forward.blockNumber) + BigInt(NOTIFY_CONFIRMATION_DEPTH)
  );
}

/**
 * DEPOSIT_UPDATED: the full snapshot whenever it changed since the last one sent. Unsettled
 * deposits are re-evaluated every pass; a settled one once more after its last change.
 */
async function emitDepositUpdatedEvents(deps: ManagerEventDeps): Promise<void> {
  // ponytail: oldest BATCH_LIMIT unsettled deposits per pass; page through them if a
  // partner ever has more than that in flight at once.
  const deposits = await MoneriumFiatDeposit.findAll({
    limit: BATCH_LIMIT,
    order: [["created_at", "ASC"]],
    where: {
      [Op.or]: [
        { status: { [Op.notIn]: SETTLED_STATUSES } },
        { lifecycleEventAt: null },
        sequelize.where(sequelize.col("updated_at"), Op.gt, sequelize.col("lifecycle_event_at"))
      ],
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` }
    }
  });
  let head: bigint | null | undefined;
  for (const deposit of deposits) {
    try {
      if (deposit.status === MoneriumFiatDepositStatus.Forwarded) {
        if (head === undefined) head = await deps.getBlockNumber();
        if (!(await forwardIsDeep(deposit.id, head))) continue;
      }
      const account = await MoneriumAccount.findByPk(deposit.accountId);
      if (!account?.vortexProfileId) continue;
      const relationship = await findRelationship(account);
      const [snapshot] = await depositSnapshots(account, relationship, [deposit]);
      const hash = snapshotHash(snapshot);
      if (hash !== deposit.lifecycleEventHash) {
        await enqueueForManager(WebhookEventType.DEPOSIT_UPDATED, relationship?.managerProfileId ?? null, {
          eventId: `deposit-updated:${deposit.id}:${hash.slice(0, 16)}`,
          eventType: WebhookEventType.DEPOSIT_UPDATED,
          payload: snapshot,
          timestamp: new Date().toISOString()
        });
      }
      // Silent: the marker must not bump updated_at, which is what re-queues a settled deposit.
      await deposit.update({ lifecycleEventAt: new Date(), lifecycleEventHash: hash }, { silent: true });
    } catch (error) {
      logger.error(`monerium-b2b: DEPOSIT_UPDATED emission failed for deposit ${deposit.id}:`, error);
    }
  }
}

/** ACCOUNT_UPDATED: the account snapshot whenever it changed (IBAN issued, status, dormancy). */
async function emitAccountUpdatedEvents(): Promise<void> {
  // ponytail: scans every mapped account each pass; fine at pilot scale.
  const accounts = await MoneriumAccount.findAll({ where: { vortexProfileId: { [Op.ne]: null } } });
  for (const account of accounts) {
    try {
      const relationship = await findRelationship(account);
      const snapshot = accountSnapshot(account, relationship);
      const hash = snapshotHash(snapshot);
      if (hash === account.lifecycleEventHash) continue;
      await enqueueForManager(WebhookEventType.ACCOUNT_UPDATED, relationship?.managerProfileId ?? null, {
        eventId: `account-updated:${account.id}:${hash.slice(0, 16)}`,
        eventType: WebhookEventType.ACCOUNT_UPDATED,
        payload: snapshot,
        timestamp: new Date().toISOString()
      });
      await account.update({ lifecycleEventHash: hash }, { silent: true });
    } catch (error) {
      logger.error(`monerium-b2b: ACCOUNT_UPDATED emission failed for account ${account.id}:`, error);
    }
  }
}

/**
 * Emits the manager-facing deposit events into the durable webhook outbox:
 * DEPOSIT_RECEIVED once a deposit is minted, DEPOSIT_CONVERTED once the whole converted
 * deposit was forwarded to the destination and that forward sits at notification depth,
 * DEPOSIT_RETURNED once a deposit that missed the promised window was refunded, and
 * DEPOSIT_UPDATED / ACCOUNT_UPDATED whenever a deposit's or account's snapshot changed.
 * Emission markers make each event fire exactly once regardless of the advancing component.
 */
export async function emitMoneriumDepositEvents(deps: ManagerEventDeps = defaultDeps): Promise<void> {
  try {
    await emitReceivedEvents();
    await emitConvertedEvents(deps);
    await emitReturnedEvents();
    await emitDepositUpdatedEvents(deps);
    await emitAccountUpdatedEvents();
  } catch (error) {
    logger.error("monerium-b2b: manager event emission failed:", error);
  }
}
