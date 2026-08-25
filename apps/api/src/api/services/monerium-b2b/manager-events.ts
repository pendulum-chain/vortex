import { DepositStatus, type DepositWebhookPayloadBase, WebhookEventType, type WebhookPayload } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ManagedProfile from "../../../models/managedProfile.model";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
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
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      receivedEventAt: null,
      status: MoneriumFiatDepositStatus.Minted
    }
  });

  for (const deposit of deposits) {
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
  }
}

async function emitConvertedEvents(deps: ManagerEventDeps): Promise<void> {
  const deposits = await MoneriumFiatDeposit.findAll({
    limit: BATCH_LIMIT,
    order: [["created_at", "ASC"]],
    where: {
      allocatedExecutionId: { [Op.ne]: null },
      convertedEventAt: null,
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` }
    }
  });
  if (deposits.length === 0) return;

  const head = await deps.getBlockNumber();
  if (head === null) return; // no read RPC: emit once the chain is configured

  for (const deposit of deposits) {
    const execution = await MoneriumConversionExecution.findByPk(deposit.allocatedExecutionId as string);
    if (!execution || execution.status !== MoneriumConversionExecutionStatus.Confirmed) continue;
    // Confirmation-depth gate (plan §3, registry P9): only notify once the execution
    // block is NOTIFY_CONFIRMATION_DEPTH below the head, so a shallow reorg cannot
    // produce a delivered-then-vanished conversion event.
    if (execution.blockNumber === null || head < BigInt(execution.blockNumber) + BigInt(NOTIFY_CONFIRMATION_DEPTH)) continue;

    const account = await MoneriumAccount.findByPk(deposit.accountId);
    if (!account) continue;
    const managerProfileId = await resolveManagerProfileId(account);
    const payload: WebhookPayload = {
      eventId: `deposit-converted:${deposit.id}`,
      eventType: WebhookEventType.DEPOSIT_CONVERTED,
      payload: {
        ...depositPayloadBase(deposit, account),
        conversion: {
          executionId: execution.id,
          txHash: execution.txHash,
          usdcNetRaw: execution.usdcNetRaw
        }
      },
      timestamp: new Date().toISOString()
    };
    await enqueueForManager(WebhookEventType.DEPOSIT_CONVERTED, managerProfileId, payload);
    await deposit.update({ convertedEventAt: new Date() });
  }
}

/**
 * Emits the manager-facing deposit events into the durable webhook outbox:
 * DEPOSIT_RECEIVED once a deposit is minted, DEPOSIT_CONVERTED once its allocated
 * execution is confirmed at notification depth. Emission markers on the deposit row
 * make each event fire exactly once regardless of which component advanced the state.
 */
export async function emitMoneriumDepositEvents(deps: ManagerEventDeps = defaultDeps): Promise<void> {
  try {
    await emitReceivedEvents();
    await emitConvertedEvents(deps);
  } catch (error) {
    logger.error("monerium-b2b: manager event emission failed:", error);
  }
}
