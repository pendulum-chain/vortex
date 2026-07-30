import { Op, Transaction } from "sequelize";
import { Address, parseEventLogs, TransactionReceipt } from "viem";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { erc20Abi, factoryAbi, forwarderAbi, getForwarderImmutables, getKeeperWalletClient, getPublicClient } from "./chain";
import { withForwarderLock } from "./deposit-processor";

/**
 * Per-account conversion executor (plan §3, "Keeper" + "Attribution (R04)"):
 * balance >= minSwapAmount -> poke() (stranding marker, R03) + swapAndForward() via the
 * private submission transport, with an execution record created and committed BEFORE
 * anything is sent, then snapshot-based deposit attribution on confirmation.
 *
 * Serialization: every database mutation runs inside the per-forwarder advisory lock
 * (withForwarderLock). The chain send/wait itself deliberately happens OUTSIDE a lock —
 * holding a transaction open across RPC waits would pin a connection for minutes, and
 * crash-safety requires the pending execution row to be durably COMMITTED before the
 * transaction is broadcast (a row inside an open transaction would roll back on crash).
 * Double-send is instead prevented by the "any pending execution -> skip" check, which
 * runs under the lock.
 */

/** Retry backoff for failed executions: base * 2^attempts, capped. Kept deliberately minimal. */
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60_000;

/** A pending execution with a tx hash but no receipt after this long is declared failed. */
const PENDING_TX_STALE_MS = 15 * 60_000;

/** How long one cycle waits for the swap receipt before deferring to the next cycle. */
const RECEIPT_TIMEOUT_MS = 3 * 60_000;

// ------------------------------------------------------------------ R04 allocation math

export interface AllocatableDeposit {
  id: string;
  amountRaw: bigint;
}

/**
 * Snapshot selection honoring the per-swap cap: deposits are taken oldest-mint-first
 * until the next one would push the cumulative amount past eureInRaw (a cap-cut deposit
 * stays unallocated and joins the next execution). Callers pass only unallocated minted
 * deposits with mint block <= execution block (R04).
 */
export function selectDepositsForExecution(deposits: AllocatableDeposit[], eureInRaw: bigint): AllocatableDeposit[] {
  const selected: AllocatableDeposit[] = [];
  let cumulative = 0n;
  for (const deposit of deposits) {
    if (cumulative + deposit.amountRaw > eureInRaw) {
      break;
    }
    cumulative += deposit.amountRaw;
    selected.push(deposit);
  }
  return selected;
}

/**
 * R04 pro-rata attribution of the execution's net USDC: each deposit gets
 * floor(usdcNetRaw * amountRaw / eureInRaw); the remainder (floor dust, plus any value
 * from inflows not represented in the selection) goes to the largest deposit (ties: the
 * earliest). Sum of shares always equals usdcNetRaw for a non-empty selection.
 */
export function allocateUsdcProRata(
  deposits: AllocatableDeposit[],
  eureInRaw: bigint,
  usdcNetRaw: bigint
): Map<string, bigint> {
  const shares = new Map<string, bigint>();
  if (deposits.length === 0 || eureInRaw <= 0n) {
    return shares;
  }
  let allocated = 0n;
  let largest = deposits[0];
  for (const deposit of deposits) {
    const share = (usdcNetRaw * deposit.amountRaw) / eureInRaw;
    shares.set(deposit.id, share);
    allocated += share;
    if (deposit.amountRaw > largest.amountRaw) {
      largest = deposit;
    }
  }
  const remainder = usdcNetRaw - allocated;
  if (remainder > 0n) {
    shares.set(largest.id, (shares.get(largest.id) as bigint) + remainder);
  }
  return shares;
}

// ------------------------------------------------------------------ finalization + attribution

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function allocateDeposits(execution: MoneriumConversionExecution, transaction: Transaction): Promise<void> {
  if (execution.blockNumber === null) {
    return;
  }
  // R04 snapshot: unallocated minted deposits with mint block <= execution block,
  // oldest mint first. Unattributed inflow rows participate: their EURe was part of the
  // swapped balance, and linking them marks the inflow as consumed by this execution.
  const deposits = await MoneriumFiatDeposit.findAll({
    order: [
      ["block_number", "ASC"],
      ["log_index", "ASC"]
    ],
    transaction,
    where: {
      accountId: execution.accountId,
      allocatedExecutionId: null,
      blockNumber: { [Op.lte]: execution.blockNumber },
      status: MoneriumFiatDepositStatus.Minted
    }
  });
  const eureInRaw = BigInt(execution.eureInRaw);
  const selected = selectDepositsForExecution(
    deposits.map(deposit => ({ amountRaw: BigInt(deposit.amountRaw), id: deposit.id })),
    eureInRaw
  );
  if (selected.length === 0) {
    return;
  }
  const shares = allocateUsdcProRata(selected, eureInRaw, BigInt(execution.usdcNetRaw ?? "0"));
  const selectedIds = selected.map(deposit => deposit.id);
  await MoneriumFiatDeposit.update(
    { allocatedExecutionId: execution.id },
    { transaction, where: { id: { [Op.in]: selectedIds } } }
  );
  logger.info(
    `monerium-b2b: execution ${execution.id} allocated ${selectedIds.length} deposit(s): ` +
      [...shares.entries()].map(([id, share]) => `${id}=${share.toString()}`).join(", ")
  );
}

/** Applies a mined receipt to a pending execution: confirmed + event amounts + R04 allocation, or failed on revert. */
async function finalizeExecution(
  execution: MoneriumConversionExecution,
  receipt: TransactionReceipt,
  forwarderAddress: string,
  transaction: Transaction
): Promise<void> {
  if (receipt.status !== "success") {
    await execution.update(
      {
        blockNumber: Number(receipt.blockNumber),
        error: "swapAndForward reverted",
        status: MoneriumConversionExecutionStatus.Failed
      },
      { transaction }
    );
    return;
  }
  const swapEvents = parseEventLogs({ abi: forwarderAbi, eventName: "SwapExecuted", logs: receipt.logs }).filter(
    log => log.address.toLowerCase() === forwarderAddress.toLowerCase()
  );
  if (swapEvents.length === 0) {
    // A successful swapAndForward always emits SwapExecuted; treat absence as failure.
    await execution.update(
      {
        blockNumber: Number(receipt.blockNumber),
        error: "receipt succeeded but no SwapExecuted event was emitted by the forwarder",
        status: MoneriumConversionExecutionStatus.Failed
      },
      { transaction }
    );
    return;
  }
  const { eureIn, usdcOut, fee, forwarded } = swapEvents[0].args;
  await execution.update(
    {
      blockNumber: Number(receipt.blockNumber),
      error: null,
      // The event's amountIn is authoritative (min(balance, cap) at execution time).
      eureInRaw: eureIn.toString(),
      feeRaw: fee.toString(),
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: receipt.transactionHash,
      usdcGrossRaw: usdcOut.toString(),
      usdcNetRaw: forwarded.toString()
    },
    { transaction }
  );
  await allocateDeposits(execution, transaction);
}

// ------------------------------------------------------------------ pending resolution + backoff

type PreparationResult = { kind: "proceed"; attempt: number } | { kind: "skip"; reason: string };

/**
 * Under the forwarder lock: resolve leftover pending executions (crash/timeout
 * recovery), then decide whether a new execution may start (retry backoff).
 */
async function prepareExecutionSlot(account: MoneriumAccount, transaction: Transaction): Promise<PreparationResult> {
  const pendings = await MoneriumConversionExecution.findAll({
    order: [["created_at", "ASC"]],
    transaction,
    where: { accountId: account.id, status: MoneriumConversionExecutionStatus.Pending }
  });
  for (const pending of pendings) {
    if (!pending.txHash) {
      // Execution-before-send record with no hash: the process died between commit and
      // broadcast, so nothing is in flight — safe to fail and retry.
      await pending.update(
        { error: "crashed before the transaction was sent", status: MoneriumConversionExecutionStatus.Failed },
        { transaction }
      );
      continue;
    }
    const receipt = await getPublicClient()
      .getTransactionReceipt({ hash: pending.txHash as Address })
      .catch(() => null);
    if (receipt) {
      await finalizeExecution(pending, receipt, account.forwarderAddress, transaction);
    } else if (Date.now() - pending.updatedAt.getTime() > PENDING_TX_STALE_MS) {
      await pending.update(
        { error: "timed out waiting for a receipt", status: MoneriumConversionExecutionStatus.Failed },
        { transaction }
      );
    } else {
      return { kind: "skip", reason: `execution ${pending.id} still awaiting receipt ${pending.txHash}` };
    }
  }

  // Backoff over consecutive failures since the last confirmed execution.
  const lastConfirmed = await MoneriumConversionExecution.findOne({
    order: [["created_at", "DESC"]],
    transaction,
    where: { accountId: account.id, status: MoneriumConversionExecutionStatus.Confirmed }
  });
  const failedSince: MoneriumConversionExecution[] = await MoneriumConversionExecution.findAll({
    order: [["created_at", "DESC"]],
    transaction,
    where: {
      accountId: account.id,
      status: MoneriumConversionExecutionStatus.Failed,
      ...(lastConfirmed ? { createdAt: { [Op.gt]: lastConfirmed.createdAt } } : {})
    }
  });
  if (failedSince.length > 0) {
    const backoffMs = Math.min(RETRY_BASE_MS * 2 ** (failedSince.length - 1), RETRY_MAX_MS);
    const nextAttemptAt = failedSince[0].updatedAt.getTime() + backoffMs;
    if (Date.now() < nextAttemptAt) {
      return { kind: "skip", reason: `retry backoff until ${new Date(nextAttemptAt).toISOString()}` };
    }
  }
  return { attempt: failedSince.length + 1, kind: "proceed" };
}

// ------------------------------------------------------------------ executor

/**
 * Runs one conversion cycle for an account. Safe to call for accounts with nothing to
 * do (cheap chain reads, then returns).
 */
export async function runConversionExecutor(accountId: string): Promise<void> {
  const account = await MoneriumAccount.findByPk(accountId);
  if (!account) {
    return;
  }
  if (account.status === MoneriumAccountStatus.Suspended || account.status === MoneriumAccountStatus.Closed) {
    return;
  }
  if (account.dormantSince) {
    // Guardian-paused for dormancy — swapAndForward would revert Paused(). Unpausing is
    // manual after partner re-confirmation (registry B5).
    return;
  }

  const client = getPublicClient();
  const forwarder = account.forwarderAddress as Address;
  const { eure, factory } = await getForwarderImmutables(forwarder);
  const [balance, strandedSince, minSwapAmount, minSwapFloor, perSwapCap] = await Promise.all([
    client.readContract({ abi: erc20Abi, address: eure, args: [forwarder], functionName: "balanceOf" }),
    client.readContract({ abi: forwarderAbi, address: forwarder, functionName: "strandedSince" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "minSwapAmount" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "MIN_SWAP_FLOOR" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "perSwapCap" })
  ]);

  // R03: arm the stranding marker whenever funds cross the immutable floor, even below
  // the (guardian-tunable) minSwapAmount — the dead-man timers must start regardless of
  // whether a swap is currently possible.
  const pokeNeeded = strandedSince === 0n && balance >= minSwapFloor;

  if (balance < minSwapAmount) {
    if (pokeNeeded) {
      await sendPoke(forwarder);
    }
    return;
  }

  const preparation = await withForwarderLock(account.forwarderAddress, transaction =>
    prepareExecutionSlot(account, transaction)
  );
  if (preparation.kind === "skip") {
    logger.info(`monerium-b2b: skipping conversion for account ${account.id}: ${preparation.reason}`);
    return;
  }

  // Execution-before-send record (plan §3): committed before any broadcast so a crash
  // leaves an auditable pending row, never an untracked on-chain swap.
  const execution = await withForwarderLock(account.forwarderAddress, transaction =>
    MoneriumConversionExecution.create(
      {
        accountId: account.id,
        destination: account.destination,
        eureInRaw: (balance > perSwapCap ? perSwapCap : balance).toString()
      },
      { transaction }
    )
  );

  try {
    const keeper = getKeeperWalletClient();
    // Explicit nonces: poke + swap are sent back-to-back through the private transport,
    // which may not expose a coherent pending pool for nonce derivation.
    let nonce = await client.getTransactionCount({ address: keeper.account.address, blockTag: "pending" });

    if (pokeNeeded) {
      await client.simulateContract({ abi: forwarderAbi, account: keeper.account, address: forwarder, functionName: "poke" });
      await keeper.writeContract({
        abi: forwarderAbi,
        account: keeper.account,
        address: forwarder,
        chain: null,
        functionName: "poke",
        nonce: nonce++
      });
    }

    await client.simulateContract({
      abi: forwarderAbi,
      account: keeper.account,
      address: forwarder,
      functionName: "swapAndForward"
    });
    const txHash = await keeper.writeContract({
      abi: forwarderAbi,
      account: keeper.account,
      address: forwarder,
      chain: null,
      functionName: "swapAndForward",
      nonce
    });
    await execution.update({ txHash });

    const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS });
    await withForwarderLock(account.forwarderAddress, transaction =>
      finalizeExecution(execution, receipt, account.forwarderAddress, transaction)
    );
  } catch (error) {
    if (execution.txHash) {
      // The transaction is (or may be) in flight; leave the row pending — the next
      // cycle resolves it via receipt lookup or declares it stale.
      logger.warn(`monerium-b2b: execution ${execution.id} awaiting receipt after error: ${errorText(error)}`);
      return;
    }
    await execution.update({
      error: `attempt ${preparation.attempt}: ${errorText(error)}`,
      status: MoneriumConversionExecutionStatus.Failed
    });
    logger.error(`monerium-b2b: conversion for account ${account.id} failed (attempt ${preparation.attempt}):`, error);
  }
}

/** Standalone stranding-marker poke for balances between the floor and minSwapAmount. */
async function sendPoke(forwarder: Address): Promise<void> {
  try {
    const client = getPublicClient();
    const keeper = getKeeperWalletClient();
    await client.simulateContract({ abi: forwarderAbi, account: keeper.account, address: forwarder, functionName: "poke" });
    const hash = await keeper.writeContract({
      abi: forwarderAbi,
      account: keeper.account,
      address: forwarder,
      chain: null,
      functionName: "poke"
    });
    logger.info(`monerium-b2b: poked forwarder ${forwarder} (${hash})`);
  } catch (error) {
    // Best-effort: poke is also permissionless on-chain, so a missed poke only delays
    // the stranding timers until the next cycle.
    logger.warn(`monerium-b2b: poke for forwarder ${forwarder} failed: ${errorText(error)}`);
  }
}
