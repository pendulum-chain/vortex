import { Op, Transaction } from "sequelize";
import { Address, encodeFunctionData, Hex, parseEventLogs, TransactionReceipt, TransactionReceiptNotFoundError } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import {
  chainlinkAbi,
  erc20Abi,
  factoryAbi,
  forwardedEvent,
  forwarderAbi,
  getChainId,
  getForwarderImmutables,
  getKeeperWalletClient,
  getPublicClient,
  quoteRouteOutput,
  readEnabledRoutes,
  readSubsidyVaultState,
  recoveredEvent,
  SubsidyVaultState,
  swapExecutedEvent
} from "./chain";
import { isForwardTransition, withForwarderLock } from "./deposit-processor";
import { UNATTRIBUTED_ORDER_PREFIX } from "./mint-watcher";
import { activeRecoveryExists } from "./recovery";
import { fetchCoinbaseReference, isWithinReferenceBand, ReferenceQuote } from "./reference-rate";

/**
 * Per-account keeper (docs/architecture-monerium-b2b-onramp.md, "Keeper"). Every keeper
 * transaction on a forwarder is an execution row bound to the deposit it serves and
 * committed BEFORE broadcast:
 *   - `swap(reference, route, amountIn)`: one chunk of one deposit (1 deposit : N swaps);
 *     the USDC waits on the clone;
 *   - `forward(amount)`: once every chunk is confirmed, the whole converted deposit goes
 *     to the client's destination in one transfer;
 *   - `recover(eure, usdc)`: a deposit marked `recovering` is moved to the recovery
 *     wallet once the clone's batch has been open for RECOVERY_DELAY.
 * One transaction per account per cycle; a pending row of any kind blocks the next.
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

/** How long one cycle waits for the receipt before deferring to the next cycle. */
const RECEIPT_TIMEOUT_MS = 3 * 60_000;

/**
 * A nonce-less pending row is a live pre-send reservation until this deadline. The
 * executor compare-and-sets the row before broadcasting, so a stalled owner cannot
 * resume and send after another process expires the reservation.
 */
const PRE_SEND_RESERVATION_MS = 5 * 60_000;

/** Keep recovery log requests below common RPC block-range limits. */
const RECOVERY_LOG_BLOCK_RANGE = 2000n;

/** Wall-clock margin over the on-chain delay so a `recover` is never simulated a few seconds early. */
const RECOVERY_ELIGIBILITY_MARGIN_MS = 30_000;

/** Deposit states the keeper still has work for. */
const SETTLING_STATUSES = [
  MoneriumFiatDepositStatus.Minted,
  MoneriumFiatDepositStatus.Converting,
  MoneriumFiatDepositStatus.Recovering
] as const;

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

interface ExecutionBroadcastSequence {
  broadcastBlockNumber: number;
  pendingNonce: number;
  pokeNeeded: boolean;
  reserve(nonce: number, broadcastBlockNumber: number): Promise<boolean>;
  sendPoke(nonce: number): Promise<void>;
  send(nonce: number): Promise<Hex>;
}

/** Safety-critical ordering: harmless poke, durable transaction identity, value-moving send. */
export async function broadcastExecutionSequence(input: ExecutionBroadcastSequence): Promise<Hex> {
  let nonce = input.pendingNonce;
  if (input.pokeNeeded) {
    await input.sendPoke(nonce);
    nonce += 1;
  }
  if (!(await input.reserve(nonce, input.broadcastBlockNumber))) {
    throw new Error("execution lost its pre-send reservation");
  }
  return input.send(nonce);
}

/**
 * Maps SwapExecuted into accounting values. The client's net for this chunk is the fill
 * minus the fee plus the vault subsidy, all of which stays on the clone until forward.
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
  /** The keeper's subsidy tier for this chunk (6 decimals): the most Vortex pays right now. */
  maxSubsidyRaw: bigint;
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
  if (subsidy > input.maxSubsidyRaw) {
    defer = `projected subsidy ${subsidy} exceeds the current tier ${input.maxSubsidyRaw}`;
  } else if (subsidy > 0n) {
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

// ------------------------------------------------------------------ subsidy ladder

/**
 * The most Vortex pays for a chunk that has waited `elapsedSeconds`, in bps of the
 * reference value: the last ladder step whose time has come (adr-0005 amendment
 * 2026-09-18). The ladder holds its last step from then on; the refund deadline, not the
 * ladder, ends the wait.
 */
export function maxSubsidyBpsFor(
  ladder: ReadonlyArray<{ afterSeconds: number; maxSubsidyBps: number }>,
  elapsedSeconds: number
): number {
  let bps = 0;
  for (const step of ladder) {
    if (elapsedSeconds >= step.afterSeconds) bps = step.maxSubsidyBps;
  }
  return bps;
}

/** How long the next chunk of a deposit has been waiting: since the mint, or since the previous chunk confirmed. */
export function chunkElapsedSeconds(
  deposit: Pick<MoneriumFiatDeposit, "createdAt" | "mintedAt">,
  lastSwapAt: Date | null,
  nowMs: number
): number {
  const since = Math.max((deposit.mintedAt ?? deposit.createdAt).getTime(), lastSwapAt?.getTime() ?? 0);
  return Math.max(0, Math.floor((nowMs - since) / 1000));
}

// ------------------------------------------------------------------ chunk planning

/**
 * Next chunk of a deposit with `remaining` unconverted EURe, or null when nothing can be
 * swapped: below `minSwapAmount` the contract refuses, and such a remainder waits for
 * the refund path (registry D5). A chunk is capped at `perSwapCap`, but never leaves a
 * sub-minimum dust remainder behind when it can avoid it: the last two chunks split so
 * both stay swappable.
 */
export function planChunk(remaining: bigint, minSwapAmount: bigint, perSwapCap: bigint): bigint | null {
  if (remaining < minSwapAmount) return null;
  if (remaining <= perSwapCap) return remaining;
  const leftover = remaining - perSwapCap;
  if (leftover >= minSwapAmount) return perSwapCap;
  const shortened = remaining - minSwapAmount;
  return shortened >= minSwapAmount ? shortened : perSwapCap;
}

// ------------------------------------------------------------------ deposit bookkeeping

export interface DepositSettlementState {
  /** Confirmed chunk swaps of the deposit, oldest first. */
  swaps: MoneriumConversionExecution[];
  /** When the newest confirmed chunk settled: the next chunk's clock starts here. */
  lastSwapAt: Date | null;
  convertedEureRaw: bigint;
  remainingEureRaw: bigint;
  /** Sum of the confirmed chunks' net USDC: what a forward or a recovery moves. */
  usdcNetRaw: bigint;
}

/** Pure aggregation of a deposit's confirmed chunk swaps. */
export function settlementState(
  deposit: Pick<MoneriumFiatDeposit, "amountRaw">,
  swaps: MoneriumConversionExecution[]
): DepositSettlementState {
  const convertedEureRaw = swaps.reduce((sum, swap) => sum + BigInt(swap.eureInRaw), 0n);
  const usdcNetRaw = swaps.reduce((sum, swap) => sum + BigInt(swap.usdcNetRaw ?? "0"), 0n);
  const remainingEureRaw = BigInt(deposit.amountRaw) - convertedEureRaw;
  const lastSwapAt = swaps.reduce<Date | null>(
    (latest, swap) => (swap.updatedAt && (!latest || swap.updatedAt > latest) ? swap.updatedAt : latest),
    null
  );
  return { convertedEureRaw, lastSwapAt, remainingEureRaw: remainingEureRaw < 0n ? 0n : remainingEureRaw, swaps, usdcNetRaw };
}

async function loadSettlementState(deposit: MoneriumFiatDeposit, transaction?: Transaction): Promise<DepositSettlementState> {
  const swaps = await MoneriumConversionExecution.findAll({
    order: [["created_at", "ASC"]],
    transaction,
    where: {
      depositId: deposit.id,
      kind: MoneriumConversionExecutionKind.Swap,
      status: MoneriumConversionExecutionStatus.Confirmed
    }
  });
  return settlementState(deposit, swaps);
}

/**
 * The deposits the keeper may act on for an account: chain-indexed (the mint watcher has
 * proven the mint), provider-attributed (R09 rows are never converted), oldest mint first.
 */
async function settlingDeposits(accountId: string, transaction?: Transaction): Promise<MoneriumFiatDeposit[]> {
  return MoneriumFiatDeposit.findAll({
    order: [
      ["block_number", "ASC"],
      ["log_index", "ASC"]
    ],
    transaction,
    where: {
      accountId,
      blockNumber: { [Op.ne]: null },
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      status: { [Op.in]: [...SETTLING_STATUSES] }
    }
  });
}

// ------------------------------------------------------------------ finalization

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function eventForKind(kind: MoneriumConversionExecutionKind) {
  switch (kind) {
    case MoneriumConversionExecutionKind.Swap:
      return swapExecutedEvent;
    case MoneriumConversionExecutionKind.Forward:
      return forwardedEvent;
    case MoneriumConversionExecutionKind.Recover:
      return recoveredEvent;
  }
}

async function failExecution(
  execution: MoneriumConversionExecution,
  receipt: TransactionReceipt,
  error: string,
  transaction: Transaction
): Promise<void> {
  await execution.update(
    { blockNumber: Number(receipt.blockNumber), error, status: MoneriumConversionExecutionStatus.Failed },
    { transaction }
  );
}

/** Applies a mined receipt to a pending execution: confirmed + event amounts, or failed on revert. */
export async function finalizeExecution(
  execution: MoneriumConversionExecution,
  receipt: TransactionReceipt,
  forwarderAddress: string,
  transaction: Transaction
): Promise<void> {
  const kind = execution.kind;
  if (receipt.status !== "success") {
    await failExecution(execution, receipt, `${kind} reverted`, transaction);
    return;
  }
  const event = eventForKind(kind);
  const events = parseEventLogs({ abi: [event], logs: receipt.logs }).filter(
    log => log.address.toLowerCase() === forwarderAddress.toLowerCase()
  );
  if (events.length === 0) {
    // A successful keeper transaction always emits its event; treat absence as failure.
    await failExecution(
      execution,
      receipt,
      `receipt succeeded but no ${event.name} event was emitted by the forwarder`,
      transaction
    );
    return;
  }
  const log = events[0];
  const blockNumber = Number(receipt.blockNumber);
  const txHash = receipt.transactionHash;

  if (kind === MoneriumConversionExecutionKind.Swap) {
    const args = log.args as {
      eureIn: bigint;
      fee: bigint;
      referenceRate: bigint;
      routeIndex: bigint;
      subsidy: bigint;
      usdcOut: bigint;
    };
    await execution.update(
      {
        blockNumber,
        error: null,
        // The event's amountIn, reference and route are authoritative: what the contract
        // actually priced and executed, whoever triggered it.
        eureInRaw: args.eureIn.toString(),
        referenceRateRaw: args.referenceRate.toString(),
        routeIndex: Number(args.routeIndex),
        ...conversionAmountsFromSwapEvent(args),
        status: MoneriumConversionExecutionStatus.Confirmed,
        swapLogIndex: log.logIndex,
        txHash
      },
      { transaction }
    );
    return;
  }

  if (kind === MoneriumConversionExecutionKind.Forward) {
    const { amount } = log.args as { amount: bigint };
    if (amount.toString() !== execution.usdcNetRaw) {
      await failExecution(
        execution,
        receipt,
        `forwarded ${amount} but the execution planned ${execution.usdcNetRaw}`,
        transaction
      );
      return;
    }
    await execution.update(
      { blockNumber, error: null, status: MoneriumConversionExecutionStatus.Confirmed, swapLogIndex: log.logIndex, txHash },
      { transaction }
    );
    await settleDeposit(execution, MoneriumFiatDepositStatus.Forwarded, transaction);
    return;
  }

  const { eureAmount, usdcAmount } = log.args as { eureAmount: bigint; usdcAmount: bigint };
  if (eureAmount.toString() !== execution.eureInRaw || usdcAmount.toString() !== execution.usdcNetRaw) {
    await failExecution(
      execution,
      receipt,
      `recovered ${eureAmount} EURe / ${usdcAmount} USDC but the execution planned ${execution.eureInRaw} / ${execution.usdcNetRaw}`,
      transaction
    );
    return;
  }
  await execution.update(
    { blockNumber, error: null, status: MoneriumConversionExecutionStatus.Confirmed, swapLogIndex: log.logIndex, txHash },
    { transaction }
  );
}

/** Forward-only deposit transition driven by a confirmed execution; ignored when already past it. */
async function settleDeposit(
  execution: MoneriumConversionExecution,
  status: MoneriumFiatDepositStatus,
  transaction: Transaction
): Promise<void> {
  if (!execution.depositId) return;
  const deposit = await MoneriumFiatDeposit.findByPk(execution.depositId, { transaction });
  if (deposit && isForwardTransition(deposit.status, status)) {
    await deposit.update({ status }, { transaction });
  }
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
 * The exact calldata a row would have broadcast, rebuilt from what was persisted before
 * the send: reference, route and chunk for a swap; the amount for a forward; both
 * amounts for a recovery. Null for a swap that never got priced.
 */
export function expectedCalldata(
  execution: Pick<
    MoneriumConversionExecution,
    "eureInRaw" | "kind" | "maxSubsidyRaw" | "referenceRateRaw" | "routeIndex" | "usdcNetRaw"
  >
): Hex | null {
  switch (execution.kind) {
    case MoneriumConversionExecutionKind.Swap:
      if (execution.referenceRateRaw === null || execution.routeIndex === null || execution.maxSubsidyRaw === null) return null;
      return encodeFunctionData({
        abi: forwarderAbi,
        args: [
          BigInt(execution.referenceRateRaw),
          BigInt(execution.routeIndex),
          BigInt(execution.eureInRaw),
          BigInt(execution.maxSubsidyRaw)
        ],
        functionName: "swap"
      });
    case MoneriumConversionExecutionKind.Forward:
      if (execution.usdcNetRaw === null) return null;
      return encodeFunctionData({ abi: forwarderAbi, args: [BigInt(execution.usdcNetRaw)], functionName: "forward" });
    case MoneriumConversionExecutionKind.Recover:
      if (execution.usdcNetRaw === null) return null;
      return encodeFunctionData({
        abi: forwarderAbi,
        args: [BigInt(execution.eureInRaw), BigInt(execution.usdcNetRaw)],
        functionName: "recover"
      });
  }
}

/** Exact transaction identity required before a lost hash may be adopted. */
export function isExpectedTransaction(
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
  matchingTxHashes: string[];
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
  if (input.matchingTxHashes.length === 1) {
    return { kind: "adopt", txHash: input.matchingTxHashes[0] };
  }
  if (input.matchingTxHashes.length > 1) {
    return { kind: "in-flight", reason: "multiple exact recovery candidates were found" };
  }
  return { kind: "fail", reason: "nonce consumed without the expected transaction" };
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
 * transactions of the row's kind with the exact keeper identity persisted on the row.
 */
async function findMatchingTxHashes(
  pending: MoneriumConversionExecution,
  account: MoneriumAccount,
  transaction: Transaction
): Promise<{ matchingTxHashes: string[]; scanComplete: boolean }> {
  const expectedInput = expectedCalldata(pending);
  if (pending.nonce === null || pending.broadcastBlockNumber === null || expectedInput === null) {
    return { matchingTxHashes: [], scanComplete: false };
  }
  const client = getPublicClient();
  const latestBlock = await client.getBlockNumber();
  const loggedHashes = new Set<Hex>();
  for (const range of recoveryBlockRanges(BigInt(pending.broadcastBlockNumber), latestBlock)) {
    const logs = await client.getLogs({
      address: account.forwarderAddress as Address,
      event: eventForKind(pending.kind),
      ...range
    });
    for (const log of logs) {
      loggedHashes.add(log.transactionHash.toLowerCase() as Hex);
    }
  }
  if (loggedHashes.size === 0) {
    return { matchingTxHashes: [], scanComplete: true };
  }
  const known = await MoneriumConversionExecution.findAll({
    attributes: ["txHash"],
    transaction,
    where: { id: { [Op.ne]: pending.id }, txHash: { [Op.ne]: null } }
  });
  const claimed = new Set(known.map(row => (row.txHash as string).toLowerCase()));
  const keeperAddress = getKeeperWalletClient().account.address;
  const matchingTxHashes: string[] = [];
  let claimedExactMatch = false;
  for (const hash of loggedHashes) {
    const candidate = await client.getTransaction({ hash });
    if (!isExpectedTransaction(candidate, keeperAddress, account.forwarderAddress, pending.nonce, expectedInput)) {
      continue;
    }
    if (claimed.has(hash.toLowerCase())) {
      claimedExactMatch = true;
    } else {
      matchingTxHashes.push(hash);
    }
  }
  return { matchingTxHashes, scanComplete: !claimedExactMatch };
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
          ? await findMatchingTxHashes(pending, account, transaction)
          : { matchingTxHashes: [], scanComplete: true };
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

export type PlannedSwap =
  | { kind: "defer"; reason: string }
  | {
      kind: "ready";
      /** The tier cap in USDC (6 decimals): the `maxSubsidy` argument of the swap. */
      maxSubsidyRaw: bigint;
      projection: SwapProjection | null;
      reference: ReferenceQuote;
      routeIndex: number;
    };

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
 * Reference, route, tier cap and projection for a swap of `amountIn`
 * (docs/architecture-monerium-b2b-onramp.md, fees section). `maxSubsidyBps` is the
 * keeper's tier for the chunk's waiting time; the cap it yields is passed into the swap
 * and binds on chain. Outside Ethereum mainnet there is no quoter pin: the first enabled
 * route is used unprojected and the contract's own checks remain the only gate.
 */
export async function pricePlannedSwap(
  forwarder: Address,
  factory: Address,
  amountIn: bigint,
  maxSubsidyBps: number
): Promise<PlannedSwap> {
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

  const referenceOut = (amountIn * reference.rateRaw) / 10n ** BigInt(12 + immutables.oracleDecimals);
  const maxSubsidyRaw = (referenceOut * BigInt(maxSubsidyBps)) / BPS;

  const routes = await readEnabledRoutes(factory);
  if (routes.length === 0) {
    return deferSwap("the factory has no enabled swap route");
  }
  if ((await getChainId()) !== 1) {
    return { kind: "ready", maxSubsidyRaw, projection: null, reference, routeIndex: routes[0].index };
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
    maxSubsidyRaw,
    oracleDecimals: immutables.oracleDecimals,
    oracleRaw,
    quotedOut: best.quotedOut,
    referenceRaw: reference.rateRaw,
    slippageBps: immutables.slippageBps,
    targetPpm: Number(targetPpm),
    vault
  });
  if (projection.defer) {
    // Calibration data for the ladder: the shortfall this attempt would have needed.
    const shortfallBps = referenceOut > 0n ? Number((projection.subsidy * BPS) / referenceOut) : 0;
    return deferSwap(
      `${projection.defer} (route ${best.index} quoted ${best.quotedOut}, shortfall ${shortfallBps} bps, tier ${maxSubsidyBps} bps)`
    );
  }
  logger.info(
    `monerium-b2b: priced swap of ${amountIn} on route ${best.index}: quoted ${best.quotedOut}, ` +
      `reference ${reference.price}, fee ${projection.fee}, subsidy ${projection.subsidy}, tier ${maxSubsidyBps} bps`
  );
  return { kind: "ready", maxSubsidyRaw, projection, reference, routeIndex: best.index };
}

// ------------------------------------------------------------------ action planning

export type PlannedAction =
  | { kind: "none"; reason: string }
  | { kind: "recover"; deposit: MoneriumFiatDeposit; eureRaw: bigint; usdcRaw: bigint }
  | { kind: "forward"; deposit: MoneriumFiatDeposit; usdcRaw: bigint }
  | { kind: "swap"; deposit: MoneriumFiatDeposit; amountIn: bigint; elapsedSeconds: number };

export interface ActionPlanningInput {
  batchOpenedAtSec: bigint;
  convertible: boolean;
  minSwapAmount: bigint;
  nowMs: number;
  perSwapCap: bigint;
  recoveryDelaySeconds: number;
  /** A recovered payment is still on the recovery wallet: no second `recover` may land there. */
  recoveryInFlight: boolean;
}

/**
 * What the keeper should do next for an account, given its settling deposits (oldest
 * mint first) and their confirmed chunks. A deposit marked `recovering` goes first, once
 * the clone's batch has been open for RECOVERY_DELAY and no other refund is in flight
 * (the recovery wallet takes one payment at a time); else it waits without blocking
 * younger deposits. Then the oldest convertible deposit is forwarded when all of its
 * EURe is converted, or swapped in its next chunk.
 */
export function planAction(
  deposits: Array<{ deposit: MoneriumFiatDeposit; state: DepositSettlementState }>,
  input: ActionPlanningInput
): PlannedAction {
  const recoveryEligibleAtMs =
    (Number(input.batchOpenedAtSec) + input.recoveryDelaySeconds) * 1000 + RECOVERY_ELIGIBILITY_MARGIN_MS;
  for (const { deposit, state } of deposits) {
    if (deposit.status !== MoneriumFiatDepositStatus.Recovering) continue;
    if (state.remainingEureRaw === 0n && state.usdcNetRaw === 0n) {
      // Nothing on chain belongs to it (e.g. forwarded permissionlessly): operator matter.
      continue;
    }
    if (input.batchOpenedAtSec === 0n || input.nowMs < recoveryEligibleAtMs) {
      continue; // the contract would revert DelayNotElapsed; younger deposits keep converting
    }
    if (input.recoveryInFlight) {
      continue; // the previous refund must leave the recovery wallet first
    }
    return { deposit, eureRaw: state.remainingEureRaw, kind: "recover", usdcRaw: state.usdcNetRaw };
  }
  if (!input.convertible) {
    return { kind: "none", reason: "account is not convertible" };
  }
  const next = deposits.find(({ deposit }) => deposit.status !== MoneriumFiatDepositStatus.Recovering);
  if (!next) {
    return { kind: "none", reason: "no settling deposit" };
  }
  if (next.state.remainingEureRaw === 0n) {
    if (next.state.usdcNetRaw === 0n) {
      return { kind: "none", reason: `deposit ${next.deposit.id} has nothing to forward` };
    }
    return { deposit: next.deposit, kind: "forward", usdcRaw: next.state.usdcNetRaw };
  }
  const amountIn = planChunk(next.state.remainingEureRaw, input.minSwapAmount, input.perSwapCap);
  if (amountIn === null) {
    return {
      kind: "none",
      reason: `deposit ${next.deposit.id} has ${next.state.remainingEureRaw} raw EURe left, below the minimum swap`
    };
  }
  return {
    amountIn,
    deposit: next.deposit,
    elapsedSeconds: chunkElapsedSeconds(next.deposit, next.state.lastSwapAt, input.nowMs),
    kind: "swap"
  };
}

// ------------------------------------------------------------------ executor

/**
 * Runs one keeper cycle for an account: at most one transaction. Safe to call for
 * accounts with nothing to do (cheap chain reads, then returns).
 */
export async function runConversionExecutor(accountId: string): Promise<void> {
  const account = await MoneriumAccount.findByPk(accountId);
  if (!account) {
    return;
  }

  // Recover an earlier broadcast before current account state can make this cycle return.
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
  if (account.status === MoneriumAccountStatus.Closed) {
    return;
  }

  // Suspended/dormant accounts never swap or forward (dormancy is guardian-paused — the
  // clone would revert Paused()), but a recovery still runs for them: the refund path is
  // exactly for payments nobody is converting any more, and `recover` ignores the pause.
  const convertible = account.status !== MoneriumAccountStatus.Suspended && !account.dormantSince;

  const client = getPublicClient();
  const forwarder = account.forwarderAddress as Address;
  const immutables = await getForwarderImmutables(forwarder);
  const { eure, factory, usdc } = immutables;
  if (
    !config.moneriumB2b.forwarderFactoryAddress ||
    factory.toLowerCase() !== config.moneriumB2b.forwarderFactoryAddress.toLowerCase()
  ) {
    throw new Error(`Forwarder ${forwarder} is not bound to the configured trusted factory`);
  }
  const [eureBalance, usdcBalance, batchOpenedAt, minSwapAmount, minSwapFloor, perSwapCap] = await Promise.all([
    client.readContract({ abi: erc20Abi, address: eure, args: [forwarder], functionName: "balanceOf" }),
    client.readContract({ abi: erc20Abi, address: usdc, args: [forwarder], functionName: "balanceOf" }),
    client.readContract({ abi: forwarderAbi, address: forwarder, functionName: "batchOpenedAt" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "minSwapAmount" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "MIN_SWAP_FLOOR" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "perSwapCap" })
  ]);

  // Arm the batch marker whenever funds are present, even below the (guardian-tunable)
  // minSwapAmount: the recovery and trigger clocks must run regardless of whether a swap
  // is currently possible.
  const pokeNeeded = batchOpenedAt === 0n && (eureBalance >= minSwapFloor || usdcBalance > 0n);

  const recoveryInFlight = await activeRecoveryExists();
  const planned = await withForwarderLock(account.forwarderAddress, async transaction => {
    const deposits = await settlingDeposits(account.id, transaction);
    const withState = [];
    for (const deposit of deposits) {
      // A deposit whose `recover` already confirmed is the orchestrator's; it never
      // recovers twice.
      const state = await loadSettlementState(deposit, transaction);
      const recovered = await MoneriumConversionExecution.count({
        transaction,
        where: {
          depositId: deposit.id,
          kind: MoneriumConversionExecutionKind.Recover,
          status: MoneriumConversionExecutionStatus.Confirmed
        }
      });
      if (recovered > 0) continue;
      withState.push({ deposit, state });
    }
    return planAction(withState, {
      batchOpenedAtSec: batchOpenedAt,
      convertible,
      minSwapAmount,
      nowMs: Date.now(),
      perSwapCap,
      recoveryDelaySeconds: immutables.recoveryDelaySeconds,
      recoveryInFlight
    });
  });
  if (planned.kind === "none") {
    if (pokeNeeded) {
      await sendPoke(forwarder);
    }
    return;
  }

  // Price a chunk before anything is reserved: reference, route and the projected
  // fee/subsidy. A deferral leaves the funds waiting (marker still armed) and never
  // creates an execution row.
  let plan: PlannedSwap | null = null;
  if (planned.kind === "swap") {
    const maxSubsidyBps = maxSubsidyBpsFor(config.moneriumB2b.subsidyLadder, planned.elapsedSeconds);
    plan = await pricePlannedSwap(forwarder, factory, planned.amountIn, maxSubsidyBps);
    if (plan.kind === "defer") {
      logger.warn(
        `monerium-b2b: deferring conversion for account ${account.id} (chunk waited ${planned.elapsedSeconds}s): ${plan.reason}`
      );
      if (pokeNeeded) {
        await sendPoke(forwarder);
      }
      return;
    }
  }
  const readyPlan = plan;
  const call = executionCall(planned, readyPlan);

  // Pending-check and execution-row create under ONE lock acquisition: split across two
  // transactions, two concurrent executors could both pass the check and both broadcast.
  const slot = await withForwarderLock(account.forwarderAddress, async transaction => {
    const preparation = await prepareExecutionSlot(account, transaction);
    if (preparation.kind === "skip") {
      return preparation;
    }
    // Execution-before-send record: committed before any broadcast so a crash leaves an
    // auditable pending row, never an untracked on-chain transaction.
    const execution = await MoneriumConversionExecution.create(
      {
        accountId: account.id,
        depositId: planned.deposit.id,
        destination: account.destination,
        eureInRaw: call.eureInRaw,
        kind: call.kind,
        usdcNetRaw: call.usdcNetRaw,
        ...(readyPlan?.kind === "ready"
          ? {
              maxSubsidyRaw: readyPlan.maxSubsidyRaw.toString(),
              referenceAt: readyPlan.reference.time,
              referenceRateRaw: readyPlan.reference.rateRaw.toString(),
              referenceSource: readyPlan.reference.source,
              routeIndex: readyPlan.routeIndex
            }
          : {})
      },
      { transaction }
    );
    if (planned.kind === "swap" && planned.deposit.status === MoneriumFiatDepositStatus.Minted) {
      await planned.deposit.update({ status: MoneriumFiatDepositStatus.Converting }, { transaction });
    }
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
    await simulateCall(client, keeper, forwarder, call.request);

    // Send phase, serialized across processes: explicit nonces because poke + send go
    // back-to-back through the private transport, which may not expose a coherent
    // pending pool for derivation. Poke is harmless and may fail before the value-moving
    // send is attempted; persist the nonce only after poke succeeds, immediately before
    // the value-moving transaction is broadcast.
    const txHash = await withKeeperSendLock(async () => {
      const [pendingNonce, broadcastBlock] = await Promise.all([
        client.getTransactionCount({ address: keeper.account.address, blockTag: "pending" }),
        client.getBlockNumber()
      ]);
      const broadcastBlockNumber = Number(broadcastBlock);
      return broadcastExecutionSequence({
        broadcastBlockNumber,
        pendingNonce,
        pokeNeeded,
        reserve: async nonce => {
          const [reserved] = await MoneriumConversionExecution.update(
            { broadcastBlockNumber, nonce },
            { where: { id: execution.id, nonce: null, status: MoneriumConversionExecutionStatus.Pending } }
          );
          if (reserved === 1) {
            execution.set({ broadcastBlockNumber, nonce });
          }
          return reserved === 1;
        },
        send: nonce => writeCall(keeper, forwarder, call.request, nonce),
        sendPoke: async nonce => {
          await keeper.writeContract({
            abi: forwarderAbi,
            account: keeper.account,
            address: forwarder,
            chain: null,
            functionName: "poke",
            nonce
          });
        }
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
    logger.error(`monerium-b2b: ${call.kind} for account ${account.id} failed (attempt ${attempt}):`, error);
  }
}

type ExecutionRequest =
  | { args: readonly [bigint, bigint, bigint, bigint]; functionName: "swap" }
  | { args: readonly [bigint]; functionName: "forward" }
  | { args: readonly [bigint, bigint]; functionName: "recover" };

/** viem needs a literal function name per overload, so the three calls are spelled out. */
async function simulateCall(
  client: ReturnType<typeof getPublicClient>,
  keeper: ReturnType<typeof getKeeperWalletClient>,
  address: Address,
  request: ExecutionRequest
): Promise<void> {
  const base = { abi: forwarderAbi, account: keeper.account, address } as const;
  switch (request.functionName) {
    case "swap":
      await client.simulateContract({ ...base, args: request.args, functionName: "swap" });
      return;
    case "forward":
      await client.simulateContract({ ...base, args: request.args, functionName: "forward" });
      return;
    case "recover":
      await client.simulateContract({ ...base, args: request.args, functionName: "recover" });
      return;
  }
}

function writeCall(
  keeper: ReturnType<typeof getKeeperWalletClient>,
  address: Address,
  request: ExecutionRequest,
  nonce: number
): Promise<Hex> {
  const base = { abi: forwarderAbi, account: keeper.account, address, chain: null, nonce } as const;
  switch (request.functionName) {
    case "swap":
      return keeper.writeContract({ ...base, args: request.args, functionName: "swap" });
    case "forward":
      return keeper.writeContract({ ...base, args: request.args, functionName: "forward" });
    case "recover":
      return keeper.writeContract({ ...base, args: request.args, functionName: "recover" });
  }
}

/** The contract call and the row amounts for a planned action. */
function executionCall(
  planned: Exclude<PlannedAction, { kind: "none" }>,
  plan: PlannedSwap | null
): { eureInRaw: string; kind: MoneriumConversionExecutionKind; request: ExecutionRequest; usdcNetRaw: string | null } {
  switch (planned.kind) {
    case "swap": {
      if (!plan || plan.kind !== "ready") throw new Error("a swap needs a priced plan");
      return {
        eureInRaw: planned.amountIn.toString(),
        kind: MoneriumConversionExecutionKind.Swap,
        request: {
          args: [plan.reference.rateRaw, BigInt(plan.routeIndex), planned.amountIn, plan.maxSubsidyRaw],
          functionName: "swap"
        },
        usdcNetRaw: null
      };
    }
    case "forward":
      return {
        eureInRaw: planned.deposit.amountRaw,
        kind: MoneriumConversionExecutionKind.Forward,
        request: { args: [planned.usdcRaw], functionName: "forward" },
        usdcNetRaw: planned.usdcRaw.toString()
      };
    case "recover":
      return {
        eureInRaw: planned.eureRaw.toString(),
        kind: MoneriumConversionExecutionKind.Recover,
        request: { args: [planned.eureRaw, planned.usdcRaw], functionName: "recover" },
        usdcNetRaw: planned.usdcRaw.toString()
      };
  }
}

/** Standalone batch-marker poke for funds the keeper cannot act on yet. */
async function sendPoke(forwarder: Address): Promise<void> {
  try {
    const client = getPublicClient();
    const keeper = getKeeperWalletClient();
    await client.simulateContract({ abi: forwarderAbi, account: keeper.account, address: forwarder, functionName: "poke" });
    // Implicit nonce, so the send still serializes with the value-moving path's derivation.
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
    // the batch clocks until the next cycle.
    logger.warn(`monerium-b2b: poke for forwarder ${forwarder} failed: ${errorText(error)}`);
  }
}

/**
 * Marks a settling deposit for the refund path. Under the forwarder lock so it cannot
 * race a chunk swap being reserved; the keeper then sends `recover` once the clone's
 * batch has been open for RECOVERY_DELAY. Returns the reason it could not, or null.
 */
export async function markDepositForRecovery(depositId: string): Promise<string | null> {
  const deposit = await MoneriumFiatDeposit.findByPk(depositId);
  if (!deposit) return "deposit not found";
  const account = await MoneriumAccount.findByPk(deposit.accountId);
  if (!account) return "deposit has no account";
  return withForwarderLock(account.forwarderAddress, async transaction => {
    const current = await MoneriumFiatDeposit.findByPk(depositId, { transaction });
    if (!current) return "deposit not found";
    if (!isForwardTransition(current.status, MoneriumFiatDepositStatus.Recovering)) {
      return `deposit is ${current.status} and cannot be recovered`;
    }
    if (current.blockNumber === null) {
      return "deposit has no chain-indexed mint yet";
    }
    const pending = await MoneriumConversionExecution.count({
      transaction,
      where: { depositId, status: MoneriumConversionExecutionStatus.Pending }
    });
    if (pending > 0) {
      return "deposit has a pending execution; retry once it settled";
    }
    await current.update({ status: MoneriumFiatDepositStatus.Recovering }, { transaction });
    return null;
  });
}
