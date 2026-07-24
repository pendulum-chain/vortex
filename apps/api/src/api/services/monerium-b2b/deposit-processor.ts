import { Transaction } from "sequelize";
import { parseUnits } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";

/**
 * Asynchronous processor for the durable webhook inbox (plan §3): upserts
 * MoneriumFiatDeposit rows by monerium_order_id with forward-only status transitions,
 * serialized per forwarder address via a Postgres transaction-scoped advisory lock.
 */

const EURE_DECIMALS = 18;

/**
 * Runs `fn` inside a transaction holding the per-forwarder advisory lock (plan §3):
 * the lock is transaction-scoped, so concurrent processors (multiple instances,
 * webhook-triggered + scheduled runs, mint watcher, conversion executor) apply writes
 * for one account strictly one at a time. Shared serialization point for the whole
 * monerium-b2b module.
 */
export async function withForwarderLock<T>(forwarderAddress: string, fn: (transaction: Transaction) => Promise<T>): Promise<T> {
  const forwarderKey = forwarderAddress.toLowerCase();
  return sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
      replacements: { key: `monerium-b2b:${forwarderKey}` },
      transaction
    });
    return fn(transaction);
  });
}

// Forward-only lattice (plan §3): pending → minted/held/returned; a compliance hold can
// still resolve to minted or returned; minted/returned are terminal.
const FORWARD_TRANSITIONS: Record<MoneriumFiatDepositStatus, readonly MoneriumFiatDepositStatus[]> = {
  [MoneriumFiatDepositStatus.Pending]: [
    MoneriumFiatDepositStatus.Minted,
    MoneriumFiatDepositStatus.Held,
    MoneriumFiatDepositStatus.Returned
  ],
  [MoneriumFiatDepositStatus.Held]: [MoneriumFiatDepositStatus.Minted, MoneriumFiatDepositStatus.Returned],
  [MoneriumFiatDepositStatus.Minted]: [],
  [MoneriumFiatDepositStatus.Returned]: []
};

export function isForwardTransition(from: MoneriumFiatDepositStatus, to: MoneriumFiatDepositStatus): boolean {
  return FORWARD_TRANSITIONS[from].includes(to);
}

/**
 * Maps a Monerium issue-order state to a deposit status, or null for states we do not
 * (yet) recognize. TODO(sandbox): pin the exact upstream state vocabulary — "processed"
 * and "rejected" are documented; the compliance-hold value is a sandbox-verification item.
 */
export function mapOrderStateToDepositStatus(state: string): MoneriumFiatDepositStatus | null {
  switch (state.trim().toLowerCase()) {
    case "placed":
    case "pending":
      return MoneriumFiatDepositStatus.Pending;
    case "processed":
      return MoneriumFiatDepositStatus.Minted;
    case "held":
    case "on_hold":
      return MoneriumFiatDepositStatus.Held;
    case "rejected":
    case "returned":
      return MoneriumFiatDepositStatus.Returned;
    default:
      return null;
  }
}

interface ParsedOrderEvent {
  orderId: string;
  forwarderAddress: string;
  amount: string;
  currency: string;
  state: string;
  txHash: string | null;
}

/**
 * Extracts the issue-order fields this processor acts on from a delivery payload
 * (documented shape: { type, timestamp, data }). Returns null for deliveries that are
 * not EURe issue orders — those are acked and marked processed without a deposit write.
 */
export function parseOrderEvent(payload: unknown): ParsedOrderEvent | null {
  const envelope = payload as { data?: unknown; type?: unknown } | null;
  if (!envelope || typeof envelope !== "object") return null;
  if (typeof envelope.type === "string" && !envelope.type.startsWith("order")) return null;
  const data = (envelope.data ?? envelope) as Record<string, unknown>;
  if (typeof data.kind === "string" && data.kind !== "issue") return null;
  if (typeof data.id !== "string" || typeof data.address !== "string" || typeof data.amount !== "string") return null;
  const state = typeof data.state === "string" ? data.state : "";
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  return {
    amount: data.amount,
    currency: typeof data.currency === "string" ? data.currency : "eur",
    forwarderAddress: data.address,
    orderId: data.id,
    state,
    txHash: typeof meta.txHash === "string" ? meta.txHash : null
  };
}

async function processInboxRow(row: MoneriumWebhookEvent): Promise<void> {
  const event = parseOrderEvent(row.payload);
  if (!event) {
    await row.update({ processedAt: new Date() });
    return;
  }

  const forwarderKey = event.forwarderAddress.toLowerCase();
  await withForwarderLock(forwarderKey, async transaction => {
    const account = await MoneriumAccount.findOne({
      transaction,
      where: sequelize.where(sequelize.fn("lower", sequelize.col("forwarder_address")), forwarderKey)
    });
    if (!account) {
      logger.warn(`monerium-b2b: webhook order ${event.orderId} references unknown forwarder address, skipping`);
      await row.update({ processedAt: new Date() }, { transaction });
      return;
    }

    const targetStatus = mapOrderStateToDepositStatus(event.state);
    const existing = await MoneriumFiatDeposit.findOne({ transaction, where: { moneriumOrderId: event.orderId } });
    if (!existing) {
      await MoneriumFiatDeposit.create(
        {
          accountId: account.id,
          amountRaw: parseUnits(event.amount, EURE_DECIMALS).toString(),
          currency: event.currency,
          moneriumOrderId: event.orderId,
          status: targetStatus ?? MoneriumFiatDepositStatus.Pending,
          txHash: event.txHash
        },
        { transaction }
      );
    } else if (targetStatus && targetStatus !== existing.status) {
      if (isForwardTransition(existing.status, targetStatus)) {
        await existing.update(
          { status: targetStatus, ...(event.txHash && !existing.txHash ? { txHash: event.txHash } : {}) },
          {
            transaction
          }
        );
      } else {
        logger.warn(
          `monerium-b2b: ignoring backward status transition ${existing.status} -> ${targetStatus} for order ${event.orderId}`
        );
      }
    }

    await row.update({ processedAt: new Date() }, { transaction });
  });
}

/**
 * Processes all unprocessed inbox rows oldest-first. A row that fails stays
 * unprocessed and is retried on the next run; rows we recognize but choose to skip are
 * marked processed so they cannot poison the loop.
 */
export async function processMoneriumWebhookInbox(): Promise<number> {
  const rows = await MoneriumWebhookEvent.findAll({
    order: [["created_at", "ASC"]],
    where: { processedAt: null }
  });
  let processed = 0;
  for (const row of rows) {
    try {
      await processInboxRow(row);
      processed += 1;
    } catch (error) {
      logger.error(`monerium-b2b: failed to process webhook inbox row ${row.eventId}:`, error);
    }
  }
  return processed;
}
