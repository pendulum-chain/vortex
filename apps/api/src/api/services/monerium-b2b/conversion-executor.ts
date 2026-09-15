import { Op, Transaction } from "sequelize";
import { Address, encodeFunctionData, Hex, parseEventLogs, TransactionReceipt, TransactionReceiptNotFoundError } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumChainCursor from "../../../models/moneriumChainCursor.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumDepositAllocation from "../../../models/moneriumDepositAllocation.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import {
  chainlinkAbi,
  erc20Abi,
  factoryAbi,
  forwarderAbi,
  getChainId,
  getForwarderImmutables,
  getKeeperWalletClient,
  getPublicClient,
  quoteRouteOutput,
  readEnabledRoutes,
  readSubsidyVaultState,
  SubsidyVaultState,
  swapExecutedEvent
} from "./chain";
import { withForwarderLock } from "./deposit-processor";
import { fetchCoinbaseReference, isWithinReferenceBand, ReferenceQuote } from "./reference-rate";

/**
 * Per-account conversion executor (plan §3, "Keeper" + "Attribution (R04)"):
 * balance >= minSwapAmount -> poke() (stranding marker, R03) + swapAndForward() via the
 * private submission transport, with an execution record created and committed BEFORE
 * anything is sent. Snapshot-based deposit attribution is deferred until the mint
 * cursor covers the confirmed swap's exact block/log boundary.
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

/** How long one cycle waits for the swap receipt before deferring to the next cycle. */
const RECEIPT_TIMEOUT_MS = 3 * 60_000;

/**
 * A nonce-less pending row is a live pre-send reservation until this deadline. The
 * executor compare-and-sets the row before broadcasting, so a stalled owner cannot
 * resume and send after another process expires the reservation.
 */
const PRE_SEND_RESERVATION_MS = 5 * 60_000;

/** Keep recovery log requests below common RPC block-range limits. */
const RECOVERY_LOG_BLOCK_RANGE = 2000n;

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

interface SwapBroadcastSequence {
  broadcastBlockNumber: number;
  pendingNonce: number;
  pokeNeeded: boolean;
  reserveSwap(nonce: number, broadcastBlockNumber: number): Promise<boolean>;
  sendPoke(nonce: number): Promise<void>;
  sendSwap(nonce: number): Promise<Hex>;
}

/** Safety-critical ordering: harmless poke, durable swap identity, value-moving send. */
export async function broadcastSwapSequence(input: SwapBroadcastSequence): Promise<Hex> {
  let swapNonce = input.pendingNonce;
  if (input.pokeNeeded) {
    await input.sendPoke(swapNonce);
    swapNonce += 1;
  }
  if (!(await input.reserveSwap(swapNonce, input.broadcastBlockNumber))) {
    throw new Error("execution lost its pre-send reservation");
  }
  return input.sendSwap(swapNonce);
}

/**
 * Maps SwapExecuted into accounting values. The client's net for this swap is the fill
 * minus the fee plus the vault subsidy paid straight to the destination; `forwarded` is
 * deliberately ignored because it may include pre-existing (unsolicited) USDC.
 */
export function conversionAmountsFromSwapEvent(event: { fee: bigint; subsidy: bigint; usdcOut: bigint }): {
  feeRaw: string;
  subsidyRaw: string;
  usdcGrossRaw: string;
  usdcNetRaw: string;
} {
  if (event.fee > event.usdcOut) {
    throw new Error("SwapExecuted fee exceeds this swap's USDC output");
  }
  return {
    feeRaw: event.fee.toString(),
    subsidyRaw: event.subsidy.toString(),
    usdcGrossRaw: event.usdcOut.toString(),
    usdcNetRaw: (event.usdcOut - event.fee + event.subsidy).toString()
  };
}

// ------------------------------------------------------------------ pricing projection

const PPM = 1_000_000n;
const BPS = 10_000n;

export interface SwapProjectionInput {
  amountIn: bigint;
  floorPpm: number;
  maxFeePpm: number;
  oracleDecimals: number;
  oracleRaw: bigint;
  quotedOut: bigint;
  referenceRaw: bigint;
  slippageBps: number;
  targetPpm: number;
  /** null when the factory has no subsidy vault configured. */
  vault: SubsidyVaultState | null;
}

export interface SwapProjection {
  /** Why the keeper must not send this swap now, or null when it may proceed. */
  defer: string | null;
  fee: bigint;
  net: bigint;
  subsidy: bigint;
}

/**
 * Off-chain mirror of VortexForwarder's settlement for a quoted fill: the fee band, the
 * subsidy band and the oracle floor on the client's net. The keeper defers — funds wait,
 * nothing is sent, no execution row is burnt — whenever the contract would revert or the
 * vault could not cover the projected subsidy.
 */
export function projectSwap(input: SwapProjectionInput): SwapProjection {
  const scale = 10n ** BigInt(12 + input.oracleDecimals);
  const referenceOut = (input.amountIn * input.referenceRaw) / scale;
  const targetOut = (referenceOut * (PPM - BigInt(input.targetPpm))) / PPM;
  const floorOut = (referenceOut * (PPM - BigInt(input.floorPpm))) / PPM;

  let fee = 0n;
  let subsidy = 0n;
  if (input.quotedOut > targetOut) {
    fee = input.quotedOut - targetOut;
    const maxFee = (input.quotedOut * BigInt(input.maxFeePpm)) / PPM;
    if (fee > maxFee) fee = maxFee;
  } else if (input.quotedOut < floorOut) {
    subsidy = floorOut - input.quotedOut;
  }
  const net = input.quotedOut - fee + subsidy;

  let defer: string | null = null;
  if (subsidy > 0n) {
    const vault = input.vault;
    if (!vault) {
      defer = `a subsidy of ${subsidy} is needed but no subsidy vault is configured`;
    } else if (vault.paused) {
      defer = `a subsidy of ${subsidy} is needed but the subsidy vault is paused`;
    } else if (subsidy > (referenceOut * BigInt(vault.maxSubsidyPpm)) / PPM) {
      defer = `projected subsidy ${subsidy} exceeds the vault's per-swap cap`;
    } else if (subsidy > vault.dailyBudget - vault.spentToday) {
      defer = `projected subsidy ${subsidy} exceeds the vault's remaining daily budget`;
    } else if (subsidy > vault.balance) {
      defer = `projected subsidy ${subsidy} exceeds the vault balance ${vault.balance}`;
    }
  }
  const oracleFloor = (((input.amountIn * input.oracleRaw) / scale) * (BPS - BigInt(input.slippageBps))) / BPS;
  if (defer === null && net < oracleFloor) {
    defer = `projected net ${net} is below the oracle floor ${oracleFloor}`;
  }
  return { defer, fee, net, subsidy };
}

// ------------------------------------------------------------------ R04 allocation math

export interface AllocatableDeposit {
  id: string;
  amountRaw: bigint;
}

/**
 * Allocates an execution across oldest outstanding deposit balances. A cap-cut deposit
 * is split: its remainder remains available for the next execution. This is what makes
 * both one-execution-to-many-deposits and one-deposit-to-many-executions representable.
 */
export function selectDepositsForExecution(deposits: AllocatableDeposit[], eureInRaw: bigint): AllocatableDeposit[] {
  const selected: AllocatableDeposit[] = [];
  let remaining = eureInRaw;
  for (const deposit of deposits) {
    if (remaining <= 0n) break;
    const amountRaw = deposit.amountRaw > remaining ? remaining : deposit.amountRaw;
    if (amountRaw <= 0n) continue;
    selected.push({ amountRaw, id: deposit.id });
    remaining -= amountRaw;
  }
  return selected;
}

/**
 * R04 pro-rata attribution of the execution's net USDC: each deposit gets
 * floor(usdcNetRaw * effectiveAmount / eureInRaw), where effectiveAmount is the
 * allocated EURe amount / eureInRaw. When allocations cover the execution exactly,
 * floor dust goes to the largest allocation (ties: earliest). If indexed deposits do
 * not cover the execution, unknown value remains unattributed instead of inflating a
 * known customer's share.
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
  const coveredEure = deposits.reduce((sum, deposit) => sum + deposit.amountRaw, 0n);
  const remainder = usdcNetRaw - allocated;
  if (coveredEure === eureInRaw && remainder > 0n) {
    shares.set(largest.id, (shares.get(largest.id) as bigint) + remainder);
  }
  return shares;
}

// ------------------------------------------------------------------ finalization + attribution

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function allocateDeposits(execution: MoneriumConversionExecution, transaction: Transaction): Promise<number> {
  if (execution.blockNumber === null || execution.swapLogIndex === null) {
    return 0;
  }
  // R04 snapshot: outstanding portions of minted deposits before the execution's exact
  // block/log position, oldest mint first. Unattributed inflows participate because
  // their EURe was part of the swapped balance, but never surface as customer claims.
  const deposits = await MoneriumFiatDeposit.findAll({
    order: [
      ["block_number", "ASC"],
      ["log_index", "ASC"]
    ],
    transaction,
    where: {
      accountId: execution.accountId,
      [Op.or]: [
        { blockNumber: { [Op.lt]: execution.blockNumber } },
        { blockNumber: execution.blockNumber, logIndex: { [Op.lt]: execution.swapLogIndex } }
      ],
      status: MoneriumFiatDepositStatus.Minted
    }
  });
  const existingAllocations = deposits.length
    ? await MoneriumDepositAllocation.findAll({ transaction, where: { depositId: deposits.map(deposit => deposit.id) } })
    : [];
  const allocatedByDeposit = new Map<string, bigint>();
  for (const allocation of existingAllocations) {
    allocatedByDeposit.set(
      allocation.depositId,
      (allocatedByDeposit.get(allocation.depositId) ?? 0n) + BigInt(allocation.eureInRaw)
    );
  }
  const eureInRaw = BigInt(execution.eureInRaw);
  const selected = selectDepositsForExecution(
    deposits
      .map(deposit => ({
        amountRaw: BigInt(deposit.amountRaw) - (allocatedByDeposit.get(deposit.id) ?? 0n),
        id: deposit.id
      }))
      .filter(deposit => deposit.amountRaw > 0n),
    eureInRaw
  );
  if (selected.length === 0) {
    return 0;
  }
  const shares = allocateUsdcProRata(selected, eureInRaw, BigInt(execution.usdcNetRaw ?? "0"));
  await MoneriumDepositAllocation.bulkCreate(
    selected.map(deposit => ({
      depositId: deposit.id,
      eureInRaw: deposit.amountRaw.toString(),
      executionId: execution.id,
      usdcNetRaw: (shares.get(deposit.id) ?? 0n).toString()
    })),
    { transaction }
  );
  const coveredEure = selected.reduce((sum, deposit) => sum + deposit.amountRaw, 0n);
  if (coveredEure !== eureInRaw) {
    logger.error(
      `monerium-b2b: execution ${execution.id} converted ${eureInRaw.toString()} raw EURe but only ` +
        `${coveredEure.toString()} was covered by indexed deposit allocations`
    );
  }
  logger.info(
    `monerium-b2b: execution ${execution.id} allocated ${selected.length} deposit portion(s): ` +
      selected
        .map(deposit => `${deposit.id}:eure=${deposit.amountRaw.toString()},usdc=${(shares.get(deposit.id) ?? 0n).toString()}`)
        .join(", ")
  );
  return selected.length;
}

/**
 * Allocates confirmed swaps only after the mint cursor has scanned through their
 * block. This closes the normal head-lag race and also includes a mint that landed
 * between the executor's balance read and the swap transaction.
 */
export async function reconcileConfirmedExecutionAllocations(
  deps: { getChainId(): Promise<number> } = { getChainId }
): Promise<number> {
  const chainId = await deps.getChainId();
  const cursor = await MoneriumChainCursor.findByPk(`eure-mints:${chainId}`);
  if (!cursor) return 0;

  const executions = await MoneriumConversionExecution.findAll({
    order: [
      ["block_number", "ASC"],
      ["swap_log_index", "ASC"]
    ],
    where: {
      blockNumber: { [Op.lte]: Number(cursor.lastBlock) },
      id: { [Op.notIn]: sequelize.literal("(SELECT execution_id FROM monerium_deposit_allocations)") },
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: { [Op.ne]: null }
    }
  });
  let allocated = 0;
  for (const execution of executions) {
    const account = await MoneriumAccount.findByPk(execution.accountId);
    if (!account) continue;
    allocated += await withForwarderLock(account.forwarderAddress, async transaction => {
      if (await MoneriumDepositAllocation.count({ transaction, where: { executionId: execution.id } })) {
        return 0;
      }
      const current = await MoneriumConversionExecution.findByPk(execution.id, { transaction });
      if (!current || current.status !== MoneriumConversionExecutionStatus.Confirmed) {
        return 0;
      }
      return allocateDeposits(current, transaction);
    });
  }
  return allocated;
}

/** Applies a mined receipt to a pending execution: confirmed + event amounts, or failed on revert. */
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
  const swapEvent = swapEvents[0];
  const { eureIn, referenceRate, routeIndex } = swapEvent.args;
  const conversionAmounts = conversionAmountsFromSwapEvent(swapEvent.args);
  await execution.update(
    {
      blockNumber: Number(receipt.blockNumber),
      error: null,
      // The event's amountIn, reference and route are authoritative: what the contract
      // actually priced and executed, whoever triggered it.
      eureInRaw: eureIn.toString(),
      referenceRateRaw: referenceRate.toString(),
      routeIndex: Number(routeIndex),
      ...conversionAmounts,
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: swapEvent.logIndex,
      txHash: receipt.transactionHash
    },
    { transaction }
  );
}

// ------------------------------------------------------------------ pending resolution + backoff

type PreparationResult = { kind: "proceed"; attempt: number } | { kind: "skip"; reason: string };

export type HashlessPendingClassification =
  | { kind: "fail"; reason: string }
  | { kind: "in-flight"; reason: string }
  | { kind: "adopt"; txHash: string };

export interface RecoveryTransactionIdentity {
  from: string;
  input: string;
  nonce: number;
  to: string | null;
}

/**
 * The exact swapAndForward calldata a row would have broadcast, rebuilt from the
 * reference and route persisted before the send. Null for a row that never got priced.
 */
export function expectedSwapCalldata(execution: { referenceRateRaw: string | null; routeIndex: number | null }): Hex | null {
  if (execution.referenceRateRaw === null || execution.routeIndex === null) {
    return null;
  }
  return encodeFunctionData({
    abi: forwarderAbi,
    args: [BigInt(execution.referenceRateRaw), BigInt(execution.routeIndex)],
    functionName: "swapAndForward"
  });
}

/** Exact transaction identity required before a lost hash may be adopted. */
export function isExpectedSwapTransaction(
  transaction: RecoveryTransactionIdentity,
  keeperAddress: string,
  forwarderAddress: string,
  nonce: number,
  expectedInput: Hex
): boolean {
  return (
    transaction.from.toLowerCase() === keeperAddress.toLowerCase() &&
    transaction.nonce === nonce &&
    transaction.to?.toLowerCase() === forwarderAddress.toLowerCase() &&
    transaction.input.toLowerCase() === expectedInput.toLowerCase()
  );
}

/**
 * Decides what happened to a pending execution whose tx hash was never persisted (a
 * crash or DB error between broadcast and the hash update). Inputs are pure chain
 * observations. A nonce that has not been consumed remains uncertain indefinitely;
 * once consumed, only one exact sender+nonce+target+calldata match may be adopted.
 */
export function classifyHashlessPending(input: {
  nonce: number | null;
  latestNonceCount: number;
  matchingSwapTxHashes: string[];
  scanComplete: boolean;
}): HashlessPendingClassification {
  if (input.nonce === null) {
    // The nonce is persisted before any broadcast, so no nonce means the send phase
    // was never reached — nothing can be in flight.
    return { kind: "fail", reason: "crashed before the transaction was sent" };
  }
  if (input.latestNonceCount <= input.nonce) {
    return { kind: "in-flight", reason: "the persisted nonce has not been consumed" };
  }
  if (!input.scanComplete) {
    return { kind: "in-flight", reason: "an exact recovery scan could not be completed" };
  }
  if (input.matchingSwapTxHashes.length === 1) {
    return { kind: "adopt", txHash: input.matchingSwapTxHashes[0] };
  }
  if (input.matchingSwapTxHashes.length > 1) {
    return { kind: "in-flight", reason: "multiple exact recovery candidates were found" };
  }
  return { kind: "fail", reason: "nonce consumed without the expected swap transaction" };
}

/** Inclusive, non-overlapping block ranges for a complete bounded recovery scan. */
export function recoveryBlockRanges(fromBlock: bigint, toBlock: bigint): Array<{ fromBlock: bigint; toBlock: bigint }> {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let start = fromBlock; start <= toBlock; start += RECOVERY_LOG_BLOCK_RANGE) {
    const end = start + RECOVERY_LOG_BLOCK_RANGE - 1n;
    ranges.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
  }
  return ranges;
}

/**
 * Scans every block since the pre-broadcast head and returns only unclaimed
 * SwapExecuted transactions with the exact keeper identity persisted on the row.
 */
async function findMatchingSwapTxHashes(
  pending: MoneriumConversionExecution,
  account: MoneriumAccount,
  transaction: Transaction
): Promise<{ matchingSwapTxHashes: string[]; scanComplete: boolean }> {
  const expectedInput = expectedSwapCalldata(pending);
  if (pending.nonce === null || pending.broadcastBlockNumber === null || expectedInput === null) {
    return { matchingSwapTxHashes: [], scanComplete: false };
  }
  const client = getPublicClient();
  const latestBlock = await client.getBlockNumber();
  const loggedHashes = new Set<Hex>();
  for (const range of recoveryBlockRanges(BigInt(pending.broadcastBlockNumber), latestBlock)) {
    const logs = await client.getLogs({
      address: account.forwarderAddress as Address,
      event: swapExecutedEvent,
      ...range
    });
    for (const log of logs) {
      loggedHashes.add(log.transactionHash.toLowerCase() as Hex);
    }
  }
  if (loggedHashes.size === 0) {
    return { matchingSwapTxHashes: [], scanComplete: true };
  }
  const known = await MoneriumConversionExecution.findAll({
    attributes: ["txHash"],
    transaction,
    where: { id: { [Op.ne]: pending.id }, txHash: { [Op.ne]: null } }
  });
  const claimed = new Set(known.map(row => (row.txHash as string).toLowerCase()));
  const hashes = [...loggedHashes];
  const keeperAddress = getKeeperWalletClient().account.address;
  const matchingSwapTxHashes: string[] = [];
  let claimedExactMatch = false;
  for (const hash of hashes) {
    const candidate = await client.getTransaction({ hash });
    if (!isExpectedSwapTransaction(candidate, keeperAddress, account.forwarderAddress, pending.nonce, expectedInput)) {
      continue;
    }
    if (claimed.has(hash.toLowerCase())) {
      claimedExactMatch = true;
    } else {
      matchingSwapTxHashes.push(hash);
    }
  }
  return { matchingSwapTxHashes, scanComplete: !claimedExactMatch };
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
    const client = getPublicClient();
    if (pending.txHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: pending.txHash as Hex });
        await finalizeExecution(pending, receipt, account.forwarderAddress, transaction);
        continue;
      } catch (error) {
        if (!(error instanceof TransactionReceiptNotFoundError)) {
          return { kind: "skip", reason: `receipt lookup failed for ${pending.txHash}: ${errorText(error)}` };
        }
      }
    }

    if (pending.nonce === null) {
      if (pending.txHash) {
        return { kind: "skip", reason: `execution ${pending.id} has a hash but no recovery nonce` };
      }
      if (Date.now() - pending.createdAt.getTime() < PRE_SEND_RESERVATION_MS) {
        return { kind: "skip", reason: `execution ${pending.id} is preparing its transaction` };
      }
      const [expired] = await MoneriumConversionExecution.update(
        { error: "crashed before the transaction was sent", status: MoneriumConversionExecutionStatus.Failed },
        {
          transaction,
          where: { id: pending.id, nonce: null, status: MoneriumConversionExecutionStatus.Pending }
        }
      );
      if (expired === 0) {
        return { kind: "skip", reason: `execution ${pending.id} changed while its pre-send reservation was expiring` };
      }
      continue;
    }

    try {
      const keeperAddress = getKeeperWalletClient().account.address;
      const latestNonceCount = await client.getTransactionCount({ address: keeperAddress, blockTag: "latest" });
      const recovery =
        latestNonceCount > pending.nonce
          ? await findMatchingSwapTxHashes(pending, account, transaction)
          : { matchingSwapTxHashes: [], scanComplete: true };
      const classification = classifyHashlessPending({ latestNonceCount, nonce: pending.nonce, ...recovery });
      if (classification.kind === "in-flight") {
        return { kind: "skip", reason: `execution ${pending.id} remains pending: ${classification.reason}` };
      }
      if (classification.kind === "fail") {
        await pending.update(
          { error: classification.reason, status: MoneriumConversionExecutionStatus.Failed },
          { transaction }
        );
        continue;
      }
      logger.warn(
        `monerium-b2b: recovered exact tx hash ${classification.txHash} for execution ${pending.id} via nonce ${pending.nonce}`
      );
      await pending.update({ txHash: classification.txHash }, { transaction });
      const receipt = await client.getTransactionReceipt({ hash: classification.txHash as Hex });
      await finalizeExecution(pending, receipt, account.forwarderAddress, transaction);
    } catch (error) {
      return { kind: "skip", reason: `recovery lookup failed for execution ${pending.id}: ${errorText(error)}` };
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

// ------------------------------------------------------------------ pricing

type PlannedSwap =
  | { kind: "defer"; reason: string }
  | { kind: "ready"; projection: SwapProjection | null; reference: ReferenceQuote; routeIndex: number };

function deferSwap(reason: string): PlannedSwap {
  return { kind: "defer", reason };
}

/** Quotes every enabled route on the mainnet QuoterV2; a route that cannot be quoted is skipped with a warning. */
async function quoteRoutes(
  routes: Array<{ index: number; path: Hex }>,
  amountIn: bigint
): Promise<Array<{ index: number; quotedOut: bigint }>> {
  const quotes: Array<{ index: number; quotedOut: bigint }> = [];
  for (const route of routes) {
    try {
      quotes.push({ index: route.index, quotedOut: await quoteRouteOutput(route.path, amountIn) });
    } catch (error) {
      logger.warn(`monerium-b2b: route ${route.index} could not be quoted: ${errorText(error)}`);
    }
  }
  return quotes;
}

/**
 * Reference, route and projection for a swap of `amountIn`
 * (docs/architecture-monerium-b2b-onramp.md, fees section). Outside Ethereum mainnet
 * there is no quoter pin: the first enabled route is used unprojected and the
 * contract's own checks remain the only gate.
 */
async function pricePlannedSwap(forwarder: Address, factory: Address, amountIn: bigint): Promise<PlannedSwap> {
  const client = getPublicClient();
  const immutables = await getForwarderImmutables(forwarder);
  const [targetPpm, floorPpm, roundData, vaultAddress] = await Promise.all([
    client.readContract({ abi: forwarderAbi, address: forwarder, functionName: "targetPpm" }),
    client.readContract({ abi: forwarderAbi, address: forwarder, functionName: "floorPpm" }),
    client.readContract({ abi: chainlinkAbi, address: immutables.oracle, functionName: "latestRoundData" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "subsidyVault" })
  ]);
  const oracleRaw = roundData[1];
  if (oracleRaw <= 0n) {
    return deferSwap(`Chainlink EUR/USD answered ${oracleRaw}`);
  }

  let reference: ReferenceQuote;
  try {
    reference = await fetchCoinbaseReference(immutables.oracleDecimals);
  } catch (error) {
    return deferSwap(`reference rate unavailable: ${errorText(error)}`);
  }
  if (!isWithinReferenceBand(reference.rateRaw, oracleRaw, immutables.maxReferenceDeviationBps)) {
    return deferSwap(
      `reference ${reference.price} is outside the ${immutables.maxReferenceDeviationBps} bps band around Chainlink ${oracleRaw}`
    );
  }

  const routes = await readEnabledRoutes(factory);
  if (routes.length === 0) {
    return deferSwap("the factory has no enabled swap route");
  }
  if ((await getChainId()) !== 1) {
    return { kind: "ready", projection: null, reference, routeIndex: routes[0].index };
  }
  const quotes = await quoteRoutes(routes, amountIn);
  if (quotes.length === 0) {
    return deferSwap("no enabled swap route could be quoted");
  }
  const best = quotes.reduce((leader, quote) => (quote.quotedOut > leader.quotedOut ? quote : leader));
  const vault = await readSubsidyVaultState(vaultAddress, immutables.usdc);
  const projection = projectSwap({
    amountIn,
    floorPpm: Number(floorPpm),
    maxFeePpm: immutables.maxFeePpm,
    oracleDecimals: immutables.oracleDecimals,
    oracleRaw,
    quotedOut: best.quotedOut,
    referenceRaw: reference.rateRaw,
    slippageBps: immutables.slippageBps,
    targetPpm: Number(targetPpm),
    vault
  });
  if (projection.defer) {
    return deferSwap(`${projection.defer} (route ${best.index} quoted ${best.quotedOut})`);
  }
  logger.info(
    `monerium-b2b: priced swap of ${amountIn} on route ${best.index}: quoted ${best.quotedOut}, ` +
      `reference ${reference.price}, fee ${projection.fee}, subsidy ${projection.subsidy}`
  );
  return { kind: "ready", projection, reference, routeIndex: best.index };
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
  if (
    !config.moneriumB2b.forwarderFactoryAddress ||
    factory.toLowerCase() !== config.moneriumB2b.forwarderFactoryAddress.toLowerCase()
  ) {
    throw new Error(`Forwarder ${forwarder} is not bound to the configured trusted factory`);
  }
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

  // Price the planned swap before anything is reserved: reference, route and the
  // projected fee/subsidy. A deferral leaves the funds waiting (marker still armed)
  // and never creates an execution row.
  const amountIn = balance > perSwapCap ? perSwapCap : balance;
  const plan = await pricePlannedSwap(forwarder, factory, amountIn);
  if (plan.kind === "defer") {
    logger.warn(`monerium-b2b: deferring conversion for account ${account.id}: ${plan.reason}`);
    if (pokeNeeded) {
      await sendPoke(forwarder);
    }
    return;
  }
  const swapArgs: readonly [bigint, bigint] = [plan.reference.rateRaw, BigInt(plan.routeIndex)];

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
        eureInRaw: amountIn.toString(),
        referenceAt: plan.reference.time,
        referenceRateRaw: plan.reference.rateRaw.toString(),
        referenceSource: plan.reference.source,
        referenceTradeId: plan.reference.tradeId,
        routeIndex: plan.routeIndex
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
      args: swapArgs,
      functionName: "swapAndForward"
    });

    // Send phase, serialized across processes: explicit nonces because poke + swap go
    // back-to-back through the private transport, which may not expose a coherent
    // pending pool for derivation. Poke is harmless and may fail before the value-moving
    // send is attempted; persist the swap nonce only after poke succeeds, immediately
    // before swapAndForward is broadcast.
    const txHash = await withKeeperSendLock(async () => {
      const [pendingNonce, broadcastBlock] = await Promise.all([
        client.getTransactionCount({ address: keeper.account.address, blockTag: "pending" }),
        client.getBlockNumber()
      ]);
      const broadcastBlockNumber = Number(broadcastBlock);
      return broadcastSwapSequence({
        broadcastBlockNumber,
        pendingNonce,
        pokeNeeded,
        reserveSwap: async nonce => {
          const [reserved] = await MoneriumConversionExecution.update(
            { broadcastBlockNumber, nonce },
            { where: { id: execution.id, nonce: null, status: MoneriumConversionExecutionStatus.Pending } }
          );
          if (reserved === 1) {
            execution.set({ broadcastBlockNumber, nonce });
          }
          return reserved === 1;
        },
        sendPoke: async nonce => {
          await keeper.writeContract({
            abi: forwarderAbi,
            account: keeper.account,
            address: forwarder,
            chain: null,
            functionName: "poke",
            nonce
          });
        },
        sendSwap: nonce =>
          keeper.writeContract({
            abi: forwarderAbi,
            account: keeper.account,
            address: forwarder,
            args: swapArgs,
            chain: null,
            functionName: "swapAndForward",
            nonce
          })
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
      // cycle resolves it by receipt or exact nonce-bound recovery. Time alone is
      // never evidence that it is safe to send another value-moving transaction.
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
