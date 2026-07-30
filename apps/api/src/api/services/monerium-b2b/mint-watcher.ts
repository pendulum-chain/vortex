import crypto from "crypto";
import { Op } from "sequelize";
import { Address } from "viem";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumChainCursor from "../../../models/moneriumChainCursor.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { eureTransferEvent, getChainId, getForwarderImmutables, getPublicClient } from "./chain";
import { withForwarderLock } from "./deposit-processor";

/**
 * Poll-based EURe Transfer watcher (plan §3, "Keeper: mint detection"): scans a
 * persisted-cursor block range for Transfers TO known forwarder addresses (from any
 * sender), matches each mint to its pending Monerium order, and flags non-Monerium
 * inflows as unattributed (R09: flagged, not treated as a customer deposit claim).
 */

/** Upper bound on blocks scanned per cycle, so getLogs stays bounded after downtime. */
const MAX_BLOCK_RANGE = 2000n;

/** Order-id prefix marking a deposit row created from a mint log with no matching Monerium order. */
export const UNATTRIBUTED_ORDER_PREFIX = "unattr:";

/**
 * Deterministic synthetic order id for an unattributed mint (monerium_order_id is NOT
 * NULL UNIQUE, max 64 chars — a raw tx hash would not fit alongside a prefix).
 */
export function syntheticUnattributedOrderId(chainId: number, txHash: string, logIndex: number): string {
  const digest = crypto.createHash("sha256").update(`${chainId}:${txHash.toLowerCase()}:${logIndex}`).digest("hex");
  return `${UNATTRIBUTED_ORDER_PREFIX}${digest.slice(0, 56)}`;
}

export interface MintLogFields {
  txHash: string;
  valueRaw: bigint;
}

export type MatchableDeposit = Pick<MoneriumFiatDeposit, "id" | "status" | "txHash" | "logIndex" | "amountRaw">;

/**
 * Picks the deposit row a mint log belongs to, among the account's deposits that are
 * still missing their mint fields (logIndex null). Precedence:
 * 1. tx-hash match — the webhook may have already recorded the mint hash (order meta);
 * 2. amount match on a pending order — oldest first (caller passes createdAt order).
 * Held/returned orders never minted, so they are not candidates. Returns null when
 * nothing matches (unattributed inflow).
 */
export function matchMintLogToDeposit(log: MintLogFields, candidates: MatchableDeposit[]): MatchableDeposit | null {
  const open = candidates.filter(
    deposit =>
      deposit.logIndex === null &&
      (deposit.status === MoneriumFiatDepositStatus.Pending || deposit.status === MoneriumFiatDepositStatus.Minted)
  );
  const byHash = open.find(deposit => deposit.txHash !== null && deposit.txHash.toLowerCase() === log.txHash.toLowerCase());
  if (byHash) {
    return byHash;
  }
  return (
    open.find(
      deposit =>
        deposit.txHash === null &&
        deposit.status === MoneriumFiatDepositStatus.Pending &&
        BigInt(deposit.amountRaw) === log.valueRaw
    ) ?? null
  );
}

interface ObservedMint {
  blockHash: string;
  blockNumber: number;
  logIndex: number;
  to: Address;
  txHash: string;
  valueRaw: bigint;
}

async function recordMint(
  mint: ObservedMint,
  chainId: number,
  accountsByForwarder: Map<string, MoneriumAccount>
): Promise<string | null> {
  const account = accountsByForwarder.get(mint.to.toLowerCase());
  if (!account) {
    // getLogs was filtered to known forwarders, so this only happens on a race with
    // account archival; nothing to record against.
    return null;
  }

  return withForwarderLock(account.forwarderAddress, async transaction => {
    // Idempotency: the (chain_id, tx_hash, log_index) partial unique index is the
    // on-chain identity; a re-scan after a crash must not double-record.
    const alreadyRecorded = await MoneriumFiatDeposit.findOne({
      transaction,
      where: { chainId, logIndex: mint.logIndex, txHash: mint.txHash }
    });
    if (alreadyRecorded) {
      return null;
    }

    const candidates = await MoneriumFiatDeposit.findAll({
      order: [["created_at", "ASC"]],
      transaction,
      where: { accountId: account.id, logIndex: null }
    });
    const match = matchMintLogToDeposit({ txHash: mint.txHash, valueRaw: mint.valueRaw }, candidates);

    if (match) {
      const deposit = candidates.find(row => row.id === match.id) as MoneriumFiatDeposit;
      await deposit.update(
        {
          blockHash: mint.blockHash,
          blockNumber: mint.blockNumber,
          chainId,
          logIndex: mint.logIndex,
          // Forward-only: pending -> minted; a webhook-minted row just gains chain fields.
          ...(deposit.status === MoneriumFiatDepositStatus.Pending ? { status: MoneriumFiatDepositStatus.Minted } : {}),
          txHash: mint.txHash
        },
        { transaction }
      );
    } else {
      // R09-adjacent: EURe arrived without a matching Monerium order (direct transfer,
      // or the order webhook has not landed yet). Record it flagged as unattributed so
      // the balance stays accounted for; it is never presented as a customer deposit.
      logger.warn(
        `monerium-b2b: unattributed EURe mint ${mint.txHash}#${mint.logIndex} of ${mint.valueRaw.toString()} raw to forwarder ${account.forwarderAddress}`
      );
      await MoneriumFiatDeposit.create(
        {
          accountId: account.id,
          amountRaw: mint.valueRaw.toString(),
          blockHash: mint.blockHash,
          blockNumber: mint.blockNumber,
          chainId,
          currency: "eur",
          logIndex: mint.logIndex,
          moneriumOrderId: syntheticUnattributedOrderId(chainId, mint.txHash, mint.logIndex),
          status: MoneriumFiatDepositStatus.Minted,
          txHash: mint.txHash
        },
        { transaction }
      );
    }
    return account.id;
  });
}

/**
 * Runs one watcher cycle. Returns the ids of accounts that received new mints, so the
 * worker can enqueue conversion for them immediately.
 */
export async function runMintWatcher(): Promise<string[]> {
  const accounts = await MoneriumAccount.findAll({
    where: { status: { [Op.ne]: MoneriumAccountStatus.Closed } }
  });
  if (accounts.length === 0) {
    return [];
  }
  const accountsByForwarder = new Map(accounts.map(account => [account.forwarderAddress.toLowerCase(), account]));

  const client = getPublicClient();
  const chainId = await getChainId();
  const { eure } = await getForwarderImmutables(accounts[0].forwarderAddress as Address);
  const latest = await client.getBlockNumber();

  const cursorName = `eure-mints:${chainId}`;
  const cursor = await MoneriumChainCursor.findByPk(cursorName);
  if (!cursor) {
    // Bootstrap: start watching from the current head. Historic mints are covered by
    // webhook-recorded orders; back-filling their chain fields is a manual operation.
    await MoneriumChainCursor.create({ lastBlock: latest.toString(), name: cursorName });
    return [];
  }

  const fromBlock = BigInt(cursor.lastBlock) + 1n;
  if (fromBlock > latest) {
    return [];
  }
  const toBlock = latest - fromBlock + 1n > MAX_BLOCK_RANGE ? fromBlock + MAX_BLOCK_RANGE - 1n : latest;

  const logs = await client.getLogs({
    address: eure,
    args: { to: accounts.map(account => account.forwarderAddress as Address) },
    event: eureTransferEvent,
    fromBlock,
    toBlock
  });

  const touchedAccounts = new Set<string>();
  for (const log of logs) {
    if (log.blockHash === null || log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
      continue; // pending log — will be picked up once mined (cursor only advances over mined ranges)
    }
    const accountId = await recordMint(
      {
        blockHash: log.blockHash,
        blockNumber: Number(log.blockNumber),
        logIndex: log.logIndex,
        to: log.args.to as Address,
        txHash: log.transactionHash,
        valueRaw: log.args.value as bigint
      },
      chainId,
      accountsByForwarder
    );
    if (accountId) {
      touchedAccounts.add(accountId);
    }
  }

  await cursor.update({ lastBlock: toBlock.toString() });
  return [...touchedAccounts];
}
