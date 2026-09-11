import { DepositStatus, type DepositWebhookPayloadBase, WebhookEventType, type WebhookPayload } from "@vortexfi/shared";
import { Op } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ManagedProfile from "../../../models/managedProfile.model";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumDepositAllocation from "../../../models/moneriumDepositAllocation.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
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
 * Resolves the controlling manager for an account's deposit events. Returns null when
 * the account is unmapped or the managed relationship is gone — the event is then
 * marked emitted with no deliveries, so history is never replayed to late subscribers.
 */
async function resolveManagerProfileId(account: MoneriumAccount): Promise<string | null> {
  if (!account.vortexProfileId) return null;
  const relationship = await ManagedProfile.findOne({
    where: { profileId: account.vortexProfileId, status: "active" }
  });
  return relationship?.managerProfileId ?? null;
}

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
      status: MoneriumFiatDepositStatus.Minted,
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
      await deposit.update({ receivedEventAt: new Date() });
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
      id: { [Op.in]: sequelize.literal("(SELECT deposit_id FROM monerium_deposit_allocations)") },
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      status: MoneriumFiatDepositStatus.Minted
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
  const allocations = await MoneriumDepositAllocation.findAll({
    order: [["created_at", "ASC"]],
    where: { depositId: deposit.id }
  });
  if (allocations.length === 0) return;
  const allocatedEure = allocations.reduce((sum, allocation) => sum + BigInt(allocation.eureInRaw), 0n);
  if (allocatedEure !== BigInt(deposit.amountRaw)) return;

  const executions = await MoneriumConversionExecution.findAll({
    where: { id: allocations.map(allocation => allocation.executionId) }
  });
  const executionById = new Map(executions.map(execution => [execution.id, execution]));
  if (executions.length !== allocations.length) return;
  if (executions.some(execution => execution.status !== MoneriumConversionExecutionStatus.Confirmed)) return;
  // Confirmation-depth gate (plan §3, registry P9): only notify once the execution
  // blocks are NOTIFY_CONFIRMATION_DEPTH below the head, so a shallow reorg cannot
  // produce a delivered-then-vanished aggregate conversion event.
  if (
    executions.some(
      execution => execution.blockNumber === null || head < BigInt(execution.blockNumber) + BigInt(NOTIFY_CONFIRMATION_DEPTH)
    )
  ) {
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
      conversions: allocations.map(allocation => {
        const execution = executionById.get(allocation.executionId) as MoneriumConversionExecution;
        return {
          eureInRaw: allocation.eureInRaw,
          executionId: execution.id,
          txHash: execution.txHash,
          usdcNetRaw: allocation.usdcNetRaw
        };
      }),
      usdcNetRaw: allocations.reduce((sum, allocation) => sum + BigInt(allocation.usdcNetRaw), 0n).toString()
    },
    timestamp: new Date().toISOString()
  };
  await enqueueForManager(WebhookEventType.DEPOSIT_CONVERTED, managerProfileId, payload);
  await deposit.update({ convertedEventAt: new Date() });
}

/**
 * Emits the manager-facing deposit events into the durable webhook outbox:
 * DEPOSIT_RECEIVED once a deposit is minted, DEPOSIT_CONVERTED once every portion is
 * allocated and all of its executions are confirmed at notification depth. Emission
 * markers make each event fire exactly once regardless of the advancing component.
 */
export async function emitMoneriumDepositEvents(deps: ManagerEventDeps = defaultDeps): Promise<void> {
  try {
    await emitReceivedEvents();
    await emitConvertedEvents(deps);
  } catch (error) {
    logger.error("monerium-b2b: manager event emission failed:", error);
  }
}
