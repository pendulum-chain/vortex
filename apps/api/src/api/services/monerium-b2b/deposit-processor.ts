import {
  type MoneriumChain,
  type MoneriumWebhookEvent as MoneriumWebhookPayload,
  moneriumWebhookEventSchema
} from "@vortexfi/shared";
import { Op, Transaction } from "sequelize";
import { parseUnits } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumDepositAllocation from "../../../models/moneriumDepositAllocation.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";
import { getChainId, moneriumChainForChainId } from "./chain";

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
  chain: MoneriumChain;
  currency: "eur";
  profileId: string;
  state: string;
  txHash: string | null;
}

export interface ParsedIbanEvent {
  address: string;
  chain: MoneriumChain;
  iban: string;
  profileId: string;
}

export interface DepositProcessorDeps {
  getChainId(): Promise<number>;
}

const defaultDeps: DepositProcessorDeps = { getChainId };

function parseWebhookPayload(payload: unknown): MoneriumWebhookPayload | null {
  const parsed = moneriumWebhookEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Extracts the fields of an iban.updated delivery ({ type, timestamp, data }): the
 * asynchronous completion of the onboarding IBAN request. Returns null for anything
 * that is not an IBAN event with both the IBAN and its linked address.
 */
export function parseIbanEvent(payload: unknown): ParsedIbanEvent | null {
  const event = parseWebhookPayload(payload);
  if (!event || event.type !== "iban.updated") return null;
  return {
    address: event.data.address,
    chain: event.data.chain,
    iban: event.data.iban.trim(),
    profileId: event.data.profile
  };
}

async function processIbanEvent(
  row: MoneriumWebhookEvent,
  event: ParsedIbanEvent,
  expectedChain: MoneriumChain
): Promise<void> {
  await withForwarderLock(event.address, async transaction => {
    const account = await MoneriumAccount.findOne({
      transaction,
      where: sequelize.where(sequelize.fn("lower", sequelize.col("forwarder_address")), event.address.toLowerCase())
    });
    if (!account) {
      logger.warn("monerium-b2b: iban.updated references an unknown forwarder address, skipping");
    } else if (event.chain !== expectedChain || event.profileId !== account.profileId) {
      logger.error(`monerium-b2b: iban.updated scope mismatch for account ${account.id}, skipping`);
    } else if (account.iban === null) {
      await account.update({ iban: event.iban }, { transaction });
    } else if (account.iban !== event.iban) {
      // Never overwrite: an IBAN change on a live account is the association
      // monitor's alert condition (PATCH /ibans detective control), not routine data.
      logger.error(
        `monerium-b2b: iban.updated reports a different IBAN for account ${account.id} — possible IBAN move, not overwriting`
      );
    }
    await row.update({ processedAt: new Date() }, { transaction });
  });
}

/**
 * Extracts the issue-order fields this processor acts on from a delivery payload
 * (documented shape: { type, timestamp, data }). Returns null for deliveries that are
 * not EURe issue orders — those are acked and marked processed without a deposit write.
 */
export function parseOrderEvent(payload: unknown): ParsedOrderEvent | null {
  const event = parseWebhookPayload(payload);
  if (!event || (event.type !== "order.created" && event.type !== "order.updated")) return null;
  const data = event.data;
  if (data.kind !== "issue" || data.currency !== "eur") return null;
  return {
    amount: data.amount,
    chain: data.chain,
    currency: data.currency,
    forwarderAddress: data.address,
    orderId: data.id,
    profileId: data.profile,
    state: data.state,
    txHash: data.meta.txHashes?.length === 1 ? data.meta.txHashes[0] : null
  };
}

async function processInboxRow(row: MoneriumWebhookEvent, deps: DepositProcessorDeps): Promise<void> {
  const parsedPayload = parseWebhookPayload(row.payload);
  if (!parsedPayload) {
    logger.error(`monerium-b2b: authenticated webhook ${row.eventId} has an invalid payload, discarding`);
    await row.update({ processedAt: new Date() });
    return;
  }

  if (
    parsedPayload.type !== "iban.updated" &&
    parsedPayload.type !== "order.created" &&
    parsedPayload.type !== "order.updated"
  ) {
    await row.update({ processedAt: new Date() });
    return;
  }

  const numericChainId = await deps.getChainId();
  const expectedChain = moneriumChainForChainId(numericChainId);
  if (!expectedChain) {
    throw new Error(`No Monerium chain name is configured for chain id ${numericChainId}`);
  }

  if (parsedPayload.type === "iban.updated") {
    await processIbanEvent(row, parseIbanEvent(parsedPayload) as ParsedIbanEvent, expectedChain);
    return;
  }

  const event = parseOrderEvent(parsedPayload);
  if (!event) {
    await row.update({ processedAt: new Date() });
    return;
  }

  let amountRaw: string;
  try {
    const parsedAmount = parseUnits(event.amount, EURE_DECIMALS);
    if (parsedAmount <= 0n) throw new Error("amount must be positive");
    amountRaw = parsedAmount.toString();
  } catch {
    logger.error(`monerium-b2b: webhook order ${event.orderId} has an invalid EUR amount, discarding`);
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
    if (event.chain !== expectedChain || event.profileId !== account.profileId) {
      logger.error(`monerium-b2b: webhook order ${event.orderId} scope mismatch for account ${account.id}, skipping`);
      await row.update({ processedAt: new Date() }, { transaction });
      return;
    }

    const targetStatus = mapOrderStateToDepositStatus(event.state);
    let existing = await MoneriumFiatDeposit.findOne({ transaction, where: { moneriumOrderId: event.orderId } });
    if (!existing && event.txHash && targetStatus === MoneriumFiatDepositStatus.Minted) {
      const unattributed = await MoneriumFiatDeposit.findAll({
        limit: 2,
        transaction,
        where: {
          [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("tx_hash")), event.txHash.toLowerCase())],
          accountId: account.id,
          amountRaw,
          chainId: numericChainId,
          moneriumOrderId: { [Op.like]: "unattr:%" },
          status: MoneriumFiatDepositStatus.Minted
        }
      });
      if (unattributed.length > 1) {
        logger.error(`monerium-b2b: webhook order ${event.orderId} matches multiple unattributed mint rows, skipping`);
        await row.update({ processedAt: new Date() }, { transaction });
        return;
      }
      if (unattributed.length === 1) {
        existing = unattributed[0];
        await existing.update({ moneriumOrderId: event.orderId }, { transaction });
        logger.info(`monerium-b2b: reconciled late order ${event.orderId} to mint ${event.txHash}`);
      }
    }
    if (existing && existing.accountId !== account.id) {
      logger.error(`monerium-b2b: webhook order ${event.orderId} is already bound to a different account, skipping`);
      await row.update({ processedAt: new Date() }, { transaction });
      return;
    }
    if (existing && existing.amountRaw !== amountRaw) {
      logger.error(`monerium-b2b: webhook order ${event.orderId} changed amount, refusing divergent replay`);
      await row.update({ processedAt: new Date() }, { transaction });
      return;
    }
    if (existing?.txHash && event.txHash && existing.txHash.toLowerCase() !== event.txHash.toLowerCase()) {
      logger.error(`monerium-b2b: webhook order ${event.orderId} changed mint transaction hash, refusing divergence`);
      await row.update({ processedAt: new Date() }, { transaction });
      return;
    }
    const canAcceptMint =
      existing &&
      (existing.status === MoneriumFiatDepositStatus.Minted ||
        isForwardTransition(existing.status, MoneriumFiatDepositStatus.Minted));
    if (
      existing &&
      canAcceptMint &&
      event.txHash &&
      targetStatus === MoneriumFiatDepositStatus.Minted &&
      existing.chainId === null &&
      existing.blockHash === null &&
      existing.blockNumber === null &&
      existing.logIndex === null
    ) {
      const unattributed = await MoneriumFiatDeposit.findAll({
        limit: 2,
        transaction,
        where: {
          [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("tx_hash")), event.txHash.toLowerCase())],
          accountId: account.id,
          amountRaw,
          chainId: numericChainId,
          id: { [Op.ne]: existing.id },
          moneriumOrderId: { [Op.like]: "unattr:%" },
          status: MoneriumFiatDepositStatus.Minted
        }
      });
      if (unattributed.length > 1) {
        logger.error(`monerium-b2b: webhook order ${event.orderId} matches multiple unattributed mint rows, skipping`);
        await row.update({ processedAt: new Date() }, { transaction });
        return;
      }
      if (unattributed.length === 1) {
        const mint = unattributed[0];
        if (await MoneriumDepositAllocation.count({ transaction, where: { depositId: existing.id } })) {
          logger.error(`monerium-b2b: webhook order ${event.orderId} already has allocations, refusing identity merge`);
          await row.update({ processedAt: new Date() }, { transaction });
          return;
        }
        await MoneriumDepositAllocation.update({ depositId: existing.id }, { transaction, where: { depositId: mint.id } });
        await mint.destroy({ transaction });
        await existing.update(
          {
            blockHash: mint.blockHash,
            blockNumber: mint.blockNumber,
            chainId: mint.chainId,
            logIndex: mint.logIndex,
            txHash: mint.txHash
          },
          { transaction }
        );
        logger.info(`monerium-b2b: merged late order ${event.orderId} with mint ${event.txHash}`);
      }
    }
    if (!existing) {
      await MoneriumFiatDeposit.create(
        {
          accountId: account.id,
          amountRaw,
          currency: event.currency,
          moneriumOrderId: event.orderId,
          status: targetStatus ?? MoneriumFiatDepositStatus.Pending,
          txHash: event.txHash
        },
        { transaction }
      );
    } else {
      const updates: { status?: MoneriumFiatDepositStatus; txHash?: string } = {};
      if (targetStatus && targetStatus !== existing.status) {
        if (isForwardTransition(existing.status, targetStatus)) {
          updates.status = targetStatus;
        } else {
          logger.warn(
            `monerium-b2b: ignoring backward status transition ${existing.status} -> ${targetStatus} for order ${event.orderId}`
          );
        }
      }
      if (targetStatus === MoneriumFiatDepositStatus.Minted && event.txHash && !existing.txHash && canAcceptMint) {
        updates.txHash = event.txHash;
      }
      if (Object.keys(updates).length > 0) {
        await existing.update(updates, { transaction });
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
export async function processMoneriumWebhookInbox(deps: DepositProcessorDeps = defaultDeps): Promise<number> {
  const rows = await MoneriumWebhookEvent.findAll({
    order: [["created_at", "ASC"]],
    where: { processedAt: null }
  });
  let processed = 0;
  for (const row of rows) {
    try {
      await processInboxRow(row, deps);
      processed += 1;
    } catch (error) {
      logger.error(`monerium-b2b: failed to process webhook inbox row ${row.eventId}:`, error);
    }
  }
  return processed;
}

/** Processed inbox rows older than this are pruned; dedup only needs the retry horizon. */
const PROCESSED_INBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Deletes long-processed inbox rows so the durable inbox stays bounded. */
export async function pruneProcessedWebhookEvents(): Promise<number> {
  const count = await MoneriumWebhookEvent.destroy({
    where: { processedAt: { [Op.lt]: new Date(Date.now() - PROCESSED_INBOX_RETENTION_MS) } }
  });
  if (count > 0) {
    logger.info(`monerium-b2b: pruned ${count} processed webhook inbox row(s)`);
  }
  return count;
}
