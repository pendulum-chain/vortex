import {
  type ConversionExecutionPricing,
  DepositStatus,
  type DepositWebhookPayloadBase,
  WebhookEventType,
  type WebhookPayload
} from "@vortexfi/shared";
import { Op } from "sequelize";
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
            amount: recovery?.refundAmount ?? refundAmountFromRaw(deposit.amountRaw),
            payerIbanMasked: deposit.payerIban ? maskIban(deposit.payerIban) : "",
            recoverTxHash: recoverExecution?.txHash ?? null,
            redeemOrderId: recovery?.redeemOrderId ?? null
          }
        },
        timestamp: new Date().toISOString()
      };
      await enqueueForManager(WebhookEventType.DEPOSIT_RETURNED, managerProfileId, payload);
      await deposit.update({ returnedEventAt: new Date() });
    } catch (error) {
      logger.error(`monerium-b2b: DEPOSIT_RETURNED emission failed for deposit ${deposit.id}:`, error);
    }
  }
}

/** The issue amount to the cent, for a refund closed by hand before a recovery row recorded it. */
function refundAmountFromRaw(amountRaw: string): string {
  const cents = BigInt(amountRaw) / 10n ** 16n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/**
 * Emits the manager-facing deposit events into the durable webhook outbox:
 * DEPOSIT_RECEIVED once a deposit is minted, DEPOSIT_CONVERTED once the whole converted
 * deposit was forwarded to the destination and that forward sits at notification depth,
 * DEPOSIT_RETURNED once a deposit that missed the promised window was refunded.
 * Emission markers make each event fire exactly once regardless of the advancing component.
 */
export async function emitMoneriumDepositEvents(deps: ManagerEventDeps = defaultDeps): Promise<void> {
  try {
    await emitReceivedEvents();
    await emitConvertedEvents(deps);
    await emitReturnedEvents();
  } catch (error) {
    logger.error("monerium-b2b: manager event emission failed:", error);
  }
}
