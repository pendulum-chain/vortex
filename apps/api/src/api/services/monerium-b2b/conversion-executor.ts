import { Op, Transaction } from "sequelize";
import { Address, parseEventLogs, TransactionReceipt, TransactionReceiptNotFoundError } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import {
  erc20Abi,
  factoryAbi,
  forwarderAbi,
  getForwarderImmutables,
  getKeeperWalletClient,
  getPublicClient,
  swapExecutedEvent
} from "./chain";
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

/**
 * Blocks scanned backwards when recovering a broadcast whose hash was never persisted
 * (~6h at 12s blocks — far beyond any realistic crash-to-restart gap; the scan only
 * runs for rows whose nonce is already consumed on-chain).
 */
const HASHLESS_RECOVERY_LOOKBACK_BLOCKS = 1800n;

/**
 * Serializes nonce derivation and the broadcasts that consume it across every process
 * sharing the database: two concurrent senders would otherwise derive the same pending
 * nonce for the single keeper account. Distinct from the per-forwarder lock, which
 * scopes per-account database state, not the keeper's global nonce sequence.
 */
async function withKeeperSendLock<T>(fn: () => Promise<T>): Promise<T> {
  return sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
      replacements: { key: "monerium-b2b:keeper-sends" },
      transaction
    });
    return fn();
  });
}

// ------------------------------------------------------------------ R04 allocation math

export interface AllocatableDeposit {
  id: string;
  amountRaw: bigint;
}

/**
 * Snapshot selection honoring the per-swap cap: deposits are taken oldest-mint-first
 * until the next one would push the cumulative amount past eureInRaw (a cap-cut deposit
 * stays unallocated and joins the next execution). One exception: an OVERSIZED oldest
 * deposit — alone larger than the swapped amount — is selected anyway, because eureIn
 * is capped at perSwapCap and only shrinks as the balance drains, so such a deposit
 * could never fit a later execution and would permanently block attribution for every
 * deposit behind it. It is attributed to the execution that begins converting it.
 * Callers pass only unallocated minted deposits with mint block <= execution block (R04).
 */
export function selectDepositsForExecution(deposits: AllocatableDeposit[], eureInRaw: bigint): AllocatableDeposit[] {
  const selected: AllocatableDeposit[] = [];
  let cumulative = 0n;
  for (const deposit of deposits) {
    if (cumulative + deposit.amountRaw > eureInRaw) {
      if (selected.length === 0) {
        selected.push(deposit);
      }
      break;
    }
    cumulative += deposit.amountRaw;
    selected.push(deposit);
  }
  return selected;
}

/**
 * R04 pro-rata attribution of the execution's net USDC: each deposit gets
 * floor(usdcNetRaw * effectiveAmount / eureInRaw), where effectiveAmount is the
 * deposit's amount clamped to the EURe this execution actually swapped (only an
 * oversized sole deposit ever clamps); the remainder (floor dust, plus any value from
 * inflows not represented in the selection) goes to the largest deposit (ties: the
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
  let cumulative = 0n;
  let largest = deposits[0];
  for (const deposit of deposits) {
    const remaining = eureInRaw > cumulative ? eureInRaw - cumulative : 0n;
    const effectiveAmount = deposit.amountRaw > remaining ? remaining : deposit.amountRaw;
    cumulative += effectiveAmount;
    const share = (usdcNetRaw * effectiveAmount) / eureInRaw;
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

export type HashlessPendingClassification =
  | { kind: "fail"; reason: string }
  | { kind: "in-flight" }
  | { kind: "adopt"; txHash: string };

/**
 * Decides what happened to a pending execution whose tx hash was never persisted (a
 * crash or DB error between broadcast and the hash update). Inputs are pure chain
 * observations: the keeper account's confirmed/pending nonce counts and any
 * SwapExecuted transaction hashes on this forwarder not claimed by another execution.
 */
export function classifyHashlessPending(input: {
  nonce: number | null;
  latestNonceCount: number;
  pendingNonceCount: number;
  unclaimedSwapTxHashes: string[];
}): HashlessPendingClassification {
  if (input.nonce === null) {
    // The nonce is persisted before any broadcast, so no nonce means the send phase
    // was never reached — nothing can be in flight.
    return { kind: "fail", reason: "crashed before the transaction was sent" };
  }
  if (input.latestNonceCount > input.nonce) {
    // The swap nonce was consumed on-chain: either our swap mined (an unclaimed
    // SwapExecuted exists — adopt its hash and finalize normally) or the transaction
    // reverted/was replaced (no event; the swap did not execute).
    const txHash = input.unclaimedSwapTxHashes[0];
    if (txHash) {
      return { kind: "adopt", txHash };
    }
    return { kind: "fail", reason: "nonce consumed without a SwapExecuted event (swap reverted or replaced)" };
  }
  if (input.pendingNonceCount > input.nonce) {
    return { kind: "in-flight" };
  }
  return { kind: "fail", reason: "broadcast never reached the mempool" };
}

/** SwapExecuted tx hashes on this forwarder (recent blocks) not claimed by any execution row. */
async function findUnclaimedSwapTxHashes(account: MoneriumAccount, transaction: Transaction): Promise<string[]> {
  const client = getPublicClient();
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > HASHLESS_RECOVERY_LOOKBACK_BLOCKS ? latestBlock - HASHLESS_RECOVERY_LOOKBACK_BLOCKS : 0n;
  const logs = await client.getLogs({
    address: account.forwarderAddress as Address,
    event: swapExecutedEvent,
    fromBlock
  });
  if (logs.length === 0) {
    return [];
  }
  const known = await MoneriumConversionExecution.findAll({
    attributes: ["txHash"],
    transaction,
    where: { accountId: account.id, txHash: { [Op.ne]: null } }
  });
  const claimed = new Set(known.map(row => (row.txHash as string).toLowerCase()));
  return logs.map(log => log.transactionHash).filter(hash => !claimed.has(hash.toLowerCase()));
}

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
      let latestNonceCount = 0;
      let pendingNonceCount = 0;
      if (pending.nonce !== null) {
        const client = getPublicClient();
        const keeperAddress = getKeeperWalletClient().account.address;
        [latestNonceCount, pendingNonceCount] = await Promise.all([
          client.getTransactionCount({ address: keeperAddress, blockTag: "latest" }),
          client.getTransactionCount({ address: keeperAddress, blockTag: "pending" })
        ]);
      }
      const unclaimedSwapTxHashes =
        pending.nonce !== null && latestNonceCount > pending.nonce ? await findUnclaimedSwapTxHashes(account, transaction) : [];
      const classification = classifyHashlessPending({
        latestNonceCount,
        nonce: pending.nonce,
        pendingNonceCount,
        unclaimedSwapTxHashes
      });
      if (classification.kind === "in-flight") {
        return {
          kind: "skip",
          reason: `execution ${pending.id} broadcast may still be in the mempool (nonce ${pending.nonce})`
        };
      }
      if (classification.kind === "fail") {
        await pending.update(
          { error: classification.reason, status: MoneriumConversionExecutionStatus.Failed },
          { transaction }
        );
        continue;
      }
      logger.warn(
        `monerium-b2b: recovered lost tx hash ${classification.txHash} for execution ${pending.id} via nonce ${pending.nonce}`
      );
      await pending.update({ txHash: classification.txHash }, { transaction });
      // fall through to the receipt path with the adopted hash
    }
    let receipt: TransactionReceipt | null;
    try {
      receipt = await getPublicClient().getTransactionReceipt({ hash: pending.txHash as Address });
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) {
        receipt = null;
      } else {
        // RPC failure is not evidence of anything — never let it run the stale clock
        // toward a false Failed while the swap may have succeeded.
        return { kind: "skip", reason: `receipt lookup failed for ${pending.txHash}: ${errorText(error)}` };
      }
    }
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

  // Recover an earlier broadcast before current account state or balance can make this
  // cycle return. A successful swap commonly drains the balance below the minimum.
  const existingPending = await MoneriumConversionExecution.findOne({
    attributes: ["id"],
    where: { accountId: account.id, status: MoneriumConversionExecutionStatus.Pending }
  });
  if (existingPending) {
    const recovery = await withForwarderLock(account.forwarderAddress, transaction =>
      prepareExecutionSlot(account, transaction)
    );
    if (recovery.kind === "skip") {
      logger.info(`monerium-b2b: skipping conversion for account ${account.id}: ${recovery.reason}`);
      return;
    }
  }

  // Suspended/closed/dormant accounts never swap (dormancy is guardian-paused —
  // swapAndForward would revert Paused()), but the stranding marker MUST still arm for
  // them: the un-pausable dead-man sweep is the client's escape hatch for exactly the
  // accounts nobody is operating any more, and poke() is pause-immune by design.
  const convertible =
    account.status !== MoneriumAccountStatus.Suspended &&
    account.status !== MoneriumAccountStatus.Closed &&
    !account.dormantSince;

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

  if (!convertible || balance < minSwapAmount) {
    if (pokeNeeded) {
      await sendPoke(forwarder);
    }
    return;
  }

  // Pending-check and execution-row create under ONE lock acquisition: split across two
  // transactions, two concurrent executors could both pass the check and both broadcast.
  const slot = await withForwarderLock(account.forwarderAddress, async transaction => {
    const preparation = await prepareExecutionSlot(account, transaction);
    if (preparation.kind === "skip") {
      return preparation;
    }
    // Execution-before-send record (plan §3): committed before any broadcast so a crash
    // leaves an auditable pending row, never an untracked on-chain swap.
    const execution = await MoneriumConversionExecution.create(
      {
        accountId: account.id,
        destination: account.destination,
        eureInRaw: (balance > perSwapCap ? perSwapCap : balance).toString()
      },
      { transaction }
    );
    return { attempt: preparation.attempt, execution, kind: "proceed" as const };
  });
  if (slot.kind === "skip") {
    logger.info(`monerium-b2b: skipping conversion for account ${account.id}: ${slot.reason}`);
    return;
  }
  const { attempt, execution } = slot;

  try {
    const keeper = getKeeperWalletClient();

    // Simulations run before the send phase so a plain revert fails the row
    // immediately (no nonce persisted yet -> the catch below marks it Failed).
    if (pokeNeeded) {
      await client.simulateContract({ abi: forwarderAbi, account: keeper.account, address: forwarder, functionName: "poke" });
    }
    await client.simulateContract({
      abi: forwarderAbi,
      account: keeper.account,
      address: forwarder,
      functionName: "swapAndForward"
    });

    // Send phase, serialized across processes: explicit nonces because poke + swap go
    // back-to-back through the private transport, which may not expose a coherent
    // pending pool for derivation. The swap nonce is persisted durably BEFORE any
    // broadcast so crash recovery can tell "never sent" from "sent, hash lost".
    const txHash = await withKeeperSendLock(async () => {
      let nonce = await client.getTransactionCount({ address: keeper.account.address, blockTag: "pending" });
      const pokeNonce = pokeNeeded ? nonce++ : null;
      await execution.update({ nonce });

      if (pokeNeeded) {
        await keeper.writeContract({
          abi: forwarderAbi,
          account: keeper.account,
          address: forwarder,
          chain: null,
          functionName: "poke",
          nonce: pokeNonce as number
        });
      }
      return keeper.writeContract({
        abi: forwarderAbi,
        account: keeper.account,
        address: forwarder,
        chain: null,
        functionName: "swapAndForward",
        nonce
      });
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
    if (execution.nonce !== null) {
      // The send phase was reached but the outcome (or the hash persist) is unknown;
      // leave the row pending — recovery resolves it via nonce consumption.
      logger.warn(
        `monerium-b2b: execution ${execution.id} broadcast outcome unknown, recovering via nonce: ${errorText(error)}`
      );
      return;
    }
    await execution.update({
      error: `attempt ${attempt}: ${errorText(error)}`,
      status: MoneriumConversionExecutionStatus.Failed
    });
    logger.error(`monerium-b2b: conversion for account ${account.id} failed (attempt ${attempt}):`, error);
  }
}

/** Standalone stranding-marker poke for balances between the floor and minSwapAmount. */
async function sendPoke(forwarder: Address): Promise<void> {
  try {
    const client = getPublicClient();
    const keeper = getKeeperWalletClient();
    await client.simulateContract({ abi: forwarderAbi, account: keeper.account, address: forwarder, functionName: "poke" });
    // Implicit nonce, so the send still serializes with the swap path's derivation.
    const hash = await withKeeperSendLock(() =>
      keeper.writeContract({
        abi: forwarderAbi,
        account: keeper.account,
        address: forwarder,
        chain: null,
        functionName: "poke"
      })
    );
    logger.info(`monerium-b2b: poked forwarder ${forwarder} (${hash})`);
  } catch (error) {
    // Best-effort: poke is also permissionless on-chain, so a missed poke only delays
    // the stranding timers until the next cycle.
    logger.warn(`monerium-b2b: poke for forwarder ${forwarder} failed: ${errorText(error)}`);
  }
}
