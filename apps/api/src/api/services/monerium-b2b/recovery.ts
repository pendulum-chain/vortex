import { buildMoneriumSepaRedemptionMessage, MoneriumApiService, type MoneriumRedeemOrderRequest } from "@vortexfi/shared";
import { Op, QueryTypes } from "sequelize";
import { Address, formatUnits, Hex } from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumRecovery, { MoneriumRecoveryPhase } from "../../../models/moneriumRecovery.model";
import {
  chainlinkAbi,
  erc20Abi,
  getChainId,
  getFloatWalletClient,
  getForwarderImmutables,
  getPublicClient,
  getRecoveryWalletClient,
  KeeperWalletClient,
  moneriumChainForChainId,
  readEnabledRoutes,
  swapRouter02Abi
} from "./chain";
import { markDepositForRecovery } from "./conversion-executor";
import { isForwardTransition, withForwarderLock } from "./deposit-processor";
import { UNATTRIBUTED_ORDER_PREFIX } from "./mint-watcher";

/**
 * The refund path (docs/architecture-monerium-b2b-onramp.md, "the refund path"):
 *
 *  1. `runRecoveryDeadlines` marks a settling deposit `recovering` once its mint is older
 *     than the promised window (MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES), or only alerts,
 *     depending on MONERIUM_B2B_AUTO_RECOVERY. The keeper then sends `recover` once the
 *     clone's batch is RECOVERY_DELAY old (conversion-executor.ts).
 *  2. `runRecoveryOrchestrator` drives ONE recovery at a time from the confirmed `recover`
 *     to the bank refund: reverse-swap the USDC on the dedicated recovery wallet, top the
 *     wallet up from the EURe float to exactly the refund amount (or sweep a surplus back
 *     to the float), place the Monerium redeem order to the payer's IBAN, and mark the
 *     deposit `refunded` when Monerium processed it.
 *
 * Crash safety rests on the recovery wallet being dedicated and empty between refunds:
 * every step re-derives what is still to do from the wallet's balances, so a lost
 * transaction hash never repeats a value-moving send (a top-up already on chain makes the
 * remaining need zero). One recovery at a time is what keeps those balances meaningful;
 * the executor refuses a second `recover` while one is in flight (`activeRecoveryExists`).
 * A step that fails beyond its retries parks the deposit in `recovery_failed` with the
 * phase preserved; an operator retry (deposit back to `recovering`) resumes there.
 */

export const REFUND_MEMO_PREFIX = "vortex-refund:";
/** Monerium requires a supporting document above this amount; such refunds stay manual (rollout G1). */
export const SUPPORTING_DOCUMENT_THRESHOLD_EUR = 15_000;
const MAX_ATTEMPTS = 5;
const RECEIPT_TIMEOUT_MS = 3 * 60_000;
const EURE_DECIMALS = 18;
const USDC_DECIMALS = 6;
const BPS = 10_000n;

// ------------------------------------------------------------------ pure helpers

/** Reverses a packed Uniswap V3 path (token, fee, token[, fee, token]) so the same pools run the other way. */
export function reversePath(path: Hex): Hex {
  const bytes = path.slice(2);
  if (bytes.length !== 86 && bytes.length !== 132) {
    throw new Error(`unexpected packed path length ${bytes.length / 2}`);
  }
  const tokens: string[] = [];
  const fees: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    tokens.push(bytes.slice(offset, offset + 40));
    offset += 40;
    if (offset < bytes.length) {
      fees.push(bytes.slice(offset, offset + 6));
      offset += 6;
    }
  }
  tokens.reverse();
  fees.reverse();
  let out = "0x";
  tokens.forEach((token, index) => {
    out += token;
    if (index < fees.length) out += fees[index];
  });
  return out as Hex;
}

/**
 * The EUR amount Monerium expects for the refund: the issue amount to the cent. Monerium
 * issues whole cents, so anything finer is a mis-recorded deposit, not a rounding case.
 */
export function refundEurAmount(amountRaw: string): string {
  const raw = BigInt(amountRaw);
  const cent = 10n ** BigInt(EURE_DECIMALS - 2);
  if (raw % cent !== 0n) {
    throw new Error(`deposit amount ${amountRaw} is not a whole number of cents`);
  }
  const cents = raw / cent;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** What the float must add (or what the reverse swap left over) for the wallet to hold exactly the refund. */
export function refundNeed(refundRaw: bigint, walletEureRaw: bigint): { surplus: bigint; topUp: bigint } {
  const diff = refundRaw - walletEureRaw;
  return diff >= 0n ? { surplus: 0n, topUp: diff } : { surplus: -diff, topUp: 0n };
}

/** Least EURe the reverse swap may return for `usdcIn` at the Chainlink EUR/USD rate, less `slippageBps`. */
export function reverseSwapMinOut(usdcIn: bigint, oracleRaw: bigint, oracleDecimals: number, slippageBps: number): bigint {
  const fair = (usdcIn * 10n ** BigInt(EURE_DECIMALS - USDC_DECIMALS + oracleDecimals)) / oracleRaw;
  return (fair * (BPS - BigInt(slippageBps))) / BPS;
}

/** Whether a settling deposit has outlived the promised window, counted from its mint. */
export function isPastDeadline(
  deposit: Pick<MoneriumFiatDeposit, "createdAt" | "mintedAt">,
  deadlineMs: number,
  nowMs: number
): boolean {
  const startedAt = deposit.mintedAt ?? deposit.createdAt;
  return nowMs - startedAt.getTime() >= deadlineMs;
}

export function refundMemo(depositId: string): string {
  return `${REFUND_MEMO_PREFIX}${depositId}`;
}

// ------------------------------------------------------------------ dependencies

export interface RecoveryDeps {
  floatWallet: Address;
  recoveryWallet: Address;
  eureBalance(address: Address): Promise<bigint>;
  usdcBalance(address: Address): Promise<bigint>;
  oracle(): Promise<{ decimals: number; raw: bigint; slippageBps: number }>;
  /** Packed USDC -> ... -> EURe path (the first enabled route, reversed). */
  reverseRoute(): Promise<Hex>;
  /** Sends the reverse swap from the recovery wallet; returns the swap tx hash. */
  sendReverseSwap(amountIn: bigint, minOut: bigint, path: Hex): Promise<Hex>;
  sendEure(from: "float" | "recovery", to: Address, amount: bigint): Promise<Hex>;
  waitReceipt(hash: Hex): Promise<"reverted" | "success">;
  moneriumChain(): Promise<string>;
  listOrdersByMemo(address: Address, memo: string): Promise<Array<{ id: string; rejectedReason?: string; state: string }>>;
  createRedeemOrder(request: MoneriumRedeemOrderRequest): Promise<{ id: string | null }>;
  getOrder(orderId: string): Promise<{ rejectedReason?: string; state: string }>;
  signMessage(message: string): Promise<string>;
  /** Forward-only deposit transition under the forwarder lock (a no-op for an illegal edge). */
  setDepositStatus(deposit: MoneriumFiatDeposit, status: MoneriumFiatDepositStatus): Promise<void>;
  now(): Date;
}

function requireClient(client: KeeperWalletClient | null, name: string): KeeperWalletClient {
  if (!client) throw new Error(`${name} is not configured`);
  return client;
}

/** Live dependencies: chain clients from ./chain, the shared Monerium client, the two wallet keys. */
export async function liveRecoveryDeps(forwarder: Address): Promise<RecoveryDeps> {
  const client = getPublicClient();
  const immutables = await getForwarderImmutables(forwarder);
  const recovery = requireClient(getRecoveryWalletClient(), "MONERIUM_B2B_RECOVERY_PRIVATE_KEY");
  const float = requireClient(getFloatWalletClient(), "MONERIUM_B2B_FLOAT_PRIVATE_KEY");
  if (recovery.account.address.toLowerCase() !== immutables.recoveryWallet.toLowerCase()) {
    throw new Error("MONERIUM_B2B_RECOVERY_PRIVATE_KEY does not control the implementation's RECOVERY_WALLET");
  }
  const balance = (token: Address, address: Address) =>
    client.readContract({ abi: erc20Abi, address: token, args: [address], functionName: "balanceOf" });
  const wallets = { float, recovery };
  return {
    async createRedeemOrder(request) {
      const result = await MoneriumApiService.getInstance().createRedemptionOrder(request);
      return { id: result.httpStatus === 200 ? result.order.id : null };
    },
    eureBalance: address => balance(immutables.eure, address),
    floatWallet: float.account.address,
    async getOrder(orderId) {
      const order = await MoneriumApiService.getInstance().getOrder(orderId);
      return { rejectedReason: order.meta.rejectedReason, state: order.state };
    },
    async listOrdersByMemo(address, memo) {
      const { orders } = await MoneriumApiService.getInstance().listOrders({ address, memo });
      return orders
        .filter(order => order.kind === "redeem" && order.memo === memo)
        .map(order => ({ id: order.id, rejectedReason: order.meta.rejectedReason, state: order.state }));
    },
    async moneriumChain() {
      const chain = moneriumChainForChainId(await getChainId());
      if (!chain) throw new Error("no Monerium chain name for the configured chain id");
      return chain;
    },
    now: () => new Date(),
    async oracle() {
      const [, answer] = await client.readContract({
        abi: chainlinkAbi,
        address: immutables.oracle,
        functionName: "latestRoundData"
      });
      if (answer <= 0n) throw new Error(`Chainlink EUR/USD answered ${answer}`);
      return { decimals: immutables.oracleDecimals, raw: answer, slippageBps: immutables.slippageBps };
    },
    recoveryWallet: recovery.account.address,
    async reverseRoute() {
      const routes = await readEnabledRoutes(immutables.factory);
      if (routes.length === 0) throw new Error("the factory has no enabled swap route to reverse");
      return reversePath(routes[0].path);
    },
    async sendEure(from, to, amount) {
      const wallet = wallets[from];
      const { request } = await client.simulateContract({
        abi: erc20Abi,
        account: wallet.account,
        address: immutables.eure,
        args: [to, amount],
        functionName: "transfer"
      });
      return wallet.writeContract({ ...request, chain: null });
    },
    async sendReverseSwap(amountIn, minOut, path) {
      const allowance = await client.readContract({
        abi: erc20Abi,
        address: immutables.usdc,
        args: [recovery.account.address, immutables.router],
        functionName: "allowance"
      });
      if (allowance < amountIn) {
        const approve = await client.simulateContract({
          abi: erc20Abi,
          account: recovery.account,
          address: immutables.usdc,
          args: [immutables.router, amountIn],
          functionName: "approve"
        });
        const approveHash = await recovery.writeContract({ ...approve.request, chain: null });
        await client.waitForTransactionReceipt({ hash: approveHash, timeout: RECEIPT_TIMEOUT_MS });
      }
      const { request } = await client.simulateContract({
        abi: swapRouter02Abi,
        account: recovery.account,
        address: immutables.router,
        args: [{ amountIn, amountOutMinimum: minOut, path, recipient: recovery.account.address }],
        functionName: "exactInput"
      });
      return recovery.writeContract({ ...request, chain: null });
    },
    setDepositStatus,
    signMessage: message => recovery.signMessage({ message }),
    usdcBalance: address => balance(immutables.usdc, address),
    async waitReceipt(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      return receipt.status;
    }
  };
}

// ------------------------------------------------------------------ deadline trigger

/**
 * Marks settling deposits whose mint is older than the promised window for the refund
 * path (`auto`), or reports them (`alert`). A deposit with a pending keeper transaction
 * is marked on a later pass, once it settled.
 */
export async function runRecoveryDeadlines(now: number = Date.now()): Promise<void> {
  const mode = config.moneriumB2b.autoRecovery;
  if (mode === "off") return;
  const deadlineMs = config.moneriumB2b.recoveryDeadlineMinutes * 60_000;
  const deposits = await MoneriumFiatDeposit.findAll({
    where: {
      blockNumber: { [Op.ne]: null },
      moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` },
      status: { [Op.in]: [MoneriumFiatDepositStatus.Minted, MoneriumFiatDepositStatus.Converting] }
    }
  });
  for (const deposit of deposits) {
    if (!isPastDeadline(deposit, deadlineMs, now)) continue;
    const ageMinutes = Math.floor((now - (deposit.mintedAt ?? deposit.createdAt).getTime()) / 60_000);
    if (mode === "alert") {
      logger.error(
        `monerium-b2b: REFUND DUE — deposit ${deposit.id} was minted ${ageMinutes} min ago and is still ${deposit.status}; ` +
          "MONERIUM_B2B_AUTO_RECOVERY=alert: mark it via POST /v1/admin/monerium-b2b/deposits/:id/recover (runbook §2.7)"
      );
      continue;
    }
    const refusal = await markDepositForRecovery(deposit.id);
    if (refusal) {
      logger.warn(`monerium-b2b: deposit ${deposit.id} is past its window but cannot be marked yet: ${refusal}`);
    } else {
      logger.warn(`monerium-b2b: deposit ${deposit.id} missed the ${ageMinutes} min window; marked for recovery`);
    }
  }
}

// ------------------------------------------------------------------ orchestrator

/**
 * True while a recovered payment is (or is about to be) on the recovery wallet: a
 * `recover` execution that is pending or confirmed whose deposit has not left the
 * refund path. The executor refuses to send another `recover` meanwhile.
 */
export async function activeRecoveryExists(): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT e.id
     FROM monerium_conversion_executions AS e
     JOIN monerium_fiat_deposits AS d ON d.id = e.deposit_id
     LEFT JOIN monerium_recoveries AS r ON r.deposit_id = e.deposit_id
     WHERE e.kind = 'recover'
       AND e.status IN ('pending', 'confirmed')
       AND d.status IN ('recovering', 'recovery_failed')
       AND (r.id IS NULL OR r.phase <> 'redeemed')
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

export async function setDepositStatus(deposit: MoneriumFiatDeposit, status: MoneriumFiatDepositStatus): Promise<void> {
  const account = await MoneriumAccount.findByPk(deposit.accountId);
  if (!account) return;
  await withForwarderLock(account.forwarderAddress, async transaction => {
    const current = await MoneriumFiatDeposit.findByPk(deposit.id, { transaction });
    if (current && isForwardTransition(current.status, status)) {
      await current.update({ status }, { transaction });
    }
  });
}

async function fail(
  recovery: MoneriumRecovery,
  deposit: MoneriumFiatDeposit,
  deps: RecoveryDeps,
  reason: string
): Promise<void> {
  logger.error(`monerium-b2b: REFUND FAILED — deposit ${deposit.id} in phase ${recovery.phase}: ${reason} (runbook §2.7)`);
  await recovery.update({ error: reason.slice(0, 500) });
  await deps.setDepositStatus(deposit, MoneriumFiatDepositStatus.RecoveryFailed);
}

async function retryOrFail(
  recovery: MoneriumRecovery,
  deposit: MoneriumFiatDeposit,
  deps: RecoveryDeps,
  phase: MoneriumRecoveryPhase,
  reason: string
): Promise<void> {
  const attempts = recovery.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await recovery.update({ attempts, phase });
    await fail(recovery, deposit, deps, `${reason} after ${attempts} attempts`);
    return;
  }
  logger.warn(`monerium-b2b: refund step for deposit ${deposit.id} failed (attempt ${attempts}): ${reason}`);
  await recovery.update({ attempts, error: reason.slice(0, 500), phase });
}

/** One step of one recovery. Returns after at most one value-moving send (plus its receipt wait). */
export async function driveRecovery(
  recovery: MoneriumRecovery,
  deposit: MoneriumFiatDeposit,
  deps: RecoveryDeps
): Promise<void> {
  const wallet = deps.recoveryWallet;
  switch (recovery.phase) {
    case MoneriumRecoveryPhase.Moved: {
      const usdc = await deps.usdcBalance(wallet);
      if (BigInt(recovery.usdcRecoveredRaw) === 0n || usdc === 0n) {
        // Nothing to swap, or a swap already landed (a lost hash): what the wallet holds
        // beyond the recovered EURe is the swap's output.
        const eure = await deps.eureBalance(wallet);
        const fromSwap = eure > BigInt(recovery.eureRecoveredRaw) ? eure - BigInt(recovery.eureRecoveredRaw) : 0n;
        await recovery.update({ eureFromSwapRaw: fromSwap.toString(), phase: MoneriumRecoveryPhase.Swapped });
        return;
      }
      const { decimals, raw, slippageBps } = await deps.oracle();
      const minOut = reverseSwapMinOut(usdc, raw, decimals, slippageBps);
      const path = await deps.reverseRoute();
      let hash: Hex;
      try {
        hash = await deps.sendReverseSwap(usdc, minOut, path);
      } catch (error) {
        await retryOrFail(recovery, deposit, deps, MoneriumRecoveryPhase.Moved, `reverse swap rejected: ${errorText(error)}`);
        return;
      }
      await recovery.update({ phase: MoneriumRecoveryPhase.Swapping, reverseSwapTxHash: hash });
      return;
    }
    case MoneriumRecoveryPhase.Swapping: {
      const hash = recovery.reverseSwapTxHash as Hex | null;
      if (!hash) {
        await recovery.update({ phase: MoneriumRecoveryPhase.Moved }); // crashed before the hash persisted: re-derive from balances
        return;
      }
      const status = await deps.waitReceipt(hash);
      if (status === "reverted") {
        await retryOrFail(recovery, deposit, deps, MoneriumRecoveryPhase.Moved, `reverse swap ${hash} reverted`);
        return;
      }
      const eure = await deps.eureBalance(wallet);
      const fromSwap = eure > BigInt(recovery.eureRecoveredRaw) ? eure - BigInt(recovery.eureRecoveredRaw) : 0n;
      await recovery.update({ eureFromSwapRaw: fromSwap.toString(), phase: MoneriumRecoveryPhase.Swapped });
      return;
    }
    case MoneriumRecoveryPhase.Swapped: {
      const refundRaw = BigInt(deposit.amountRaw);
      const { surplus, topUp } = refundNeed(refundRaw, await deps.eureBalance(wallet));
      if (topUp > 0n) {
        const floatBalance = await deps.eureBalance(deps.floatWallet);
        if (floatBalance < topUp) {
          logger.error(
            `monerium-b2b: FLOAT UNDERFUNDED — refund of deposit ${deposit.id} needs ${formatUnits(topUp, EURE_DECIMALS)} EURe, ` +
              `the float holds ${formatUnits(floatBalance, EURE_DECIMALS)}; fund ${deps.floatWallet} (runbook §2.7)`
          );
          return; // not a failure: retried every cycle once funded
        }
        let hash: Hex;
        try {
          hash = await deps.sendEure("float", wallet, topUp);
        } catch (error) {
          await retryOrFail(
            recovery,
            deposit,
            deps,
            MoneriumRecoveryPhase.Swapped,
            `float top-up rejected: ${errorText(error)}`
          );
          return;
        }
        await recovery.update({
          floatTopupRaw: topUp.toString(),
          floatTopupTxHash: hash,
          phase: MoneriumRecoveryPhase.ToppingUp
        });
        return;
      }
      if (surplus > 0n) {
        let hash: Hex;
        try {
          hash = await deps.sendEure("recovery", deps.floatWallet, surplus);
        } catch (error) {
          await retryOrFail(
            recovery,
            deposit,
            deps,
            MoneriumRecoveryPhase.Swapped,
            `surplus sweep rejected: ${errorText(error)}`
          );
          return;
        }
        await recovery.update({ phase: MoneriumRecoveryPhase.ToppingUp, surplusRaw: surplus.toString(), surplusTxHash: hash });
        return;
      }
      await recovery.update({ phase: MoneriumRecoveryPhase.ToppedUp });
      return;
    }
    case MoneriumRecoveryPhase.ToppingUp: {
      const hash = (recovery.floatTopupTxHash ?? recovery.surplusTxHash) as Hex | null;
      if (!hash) {
        await recovery.update({ phase: MoneriumRecoveryPhase.Swapped });
        return;
      }
      const status = await deps.waitReceipt(hash);
      if (status === "reverted") {
        await retryOrFail(recovery, deposit, deps, MoneriumRecoveryPhase.Swapped, `transfer ${hash} reverted`);
        return;
      }
      // Re-derive: the wallet must now hold exactly the refund; anything else loops through Swapped.
      const { surplus, topUp } = refundNeed(BigInt(deposit.amountRaw), await deps.eureBalance(wallet));
      await recovery.update({
        phase: topUp === 0n && surplus === 0n ? MoneriumRecoveryPhase.ToppedUp : MoneriumRecoveryPhase.Swapped
      });
      return;
    }
    case MoneriumRecoveryPhase.ToppedUp: {
      if (!deposit.payerIban || !deposit.payerName) {
        await fail(recovery, deposit, deps, "the issue order carried no payer IBAN/name to refund to");
        return;
      }
      let amount: string;
      try {
        amount = refundEurAmount(deposit.amountRaw);
      } catch (error) {
        await fail(recovery, deposit, deps, errorText(error));
        return;
      }
      if (Number(amount) >= SUPPORTING_DOCUMENT_THRESHOLD_EUR) {
        await fail(
          recovery,
          deposit,
          deps,
          `refunds of EUR ${SUPPORTING_DOCUMENT_THRESHOLD_EUR} or more need a supporting document; place the order by hand`
        );
        return;
      }
      const memo = refundMemo(deposit.id);
      // Exactly-once: the memo is the idempotency key at Monerium.
      const existing = await deps.listOrdersByMemo(wallet, memo);
      if (existing.length > 0) {
        await recovery.update({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: existing[0].id, refundAmount: amount });
        return;
      }
      const message = buildMoneriumSepaRedemptionMessage(amount, deposit.payerIban, deps.now());
      const request: MoneriumRedeemOrderRequest = {
        address: wallet,
        amount,
        chain: (await deps.moneriumChain()) as MoneriumRedeemOrderRequest["chain"],
        counterpart: {
          details: { companyName: deposit.payerName, country: deposit.payerIban.slice(0, 2) },
          identifier: { iban: deposit.payerIban, standard: "iban" }
        },
        currency: "eur",
        kind: "redeem",
        memo,
        message,
        signature: await deps.signMessage(message)
      };
      let placed: { id: string | null };
      try {
        placed = await deps.createRedeemOrder(request);
      } catch (error) {
        await retryOrFail(
          recovery,
          deposit,
          deps,
          MoneriumRecoveryPhase.ToppedUp,
          `redeem order rejected: ${errorText(error)}`
        );
        return;
      }
      await recovery.update({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: placed.id, refundAmount: amount });
      return;
    }
    case MoneriumRecoveryPhase.Redeeming: {
      let order: { rejectedReason?: string; state: string } | undefined;
      if (recovery.redeemOrderId) {
        order = await deps.getOrder(recovery.redeemOrderId);
      } else {
        const [found] = await deps.listOrdersByMemo(wallet, refundMemo(deposit.id));
        if (found) {
          await recovery.update({ redeemOrderId: found.id });
          order = found;
        }
      }
      if (!order) return; // accepted asynchronously: it shows up in the next listing
      if (order.state === "processed") {
        await recovery.update({ error: null, phase: MoneriumRecoveryPhase.Redeemed });
        await deps.setDepositStatus(deposit, MoneriumFiatDepositStatus.Refunded);
        logger.info(
          `monerium-b2b: deposit ${deposit.id} refunded (${recovery.refundAmount} EUR, order ${recovery.redeemOrderId})`
        );
      } else if (order.state === "rejected") {
        await fail(recovery, deposit, deps, `Monerium rejected the redeem order: ${order.rejectedReason ?? "no reason given"}`);
      }
      return;
    }
    case MoneriumRecoveryPhase.Redeemed:
      return;
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * Runs one step of the active recovery, or opens the next one: the oldest deposit in
 * `recovering` whose `recover` execution is confirmed and that has no recovery row yet.
 * A recovery whose deposit is `recovery_failed` waits for the operator and blocks the
 * queue (one wallet, one refund at a time).
 */
export async function runRecoveryOrchestrator(
  depsFor: (forwarder: Address) => Promise<RecoveryDeps> = liveRecoveryDeps
): Promise<void> {
  let recovery = await MoneriumRecovery.findOne({
    order: [["created_at", "ASC"]],
    where: { phase: { [Op.ne]: MoneriumRecoveryPhase.Redeemed } }
  });
  if (!recovery) {
    const moved = await sequelize.query<{ depositId: string; eureInRaw: string; usdcNetRaw: string }>(
      `SELECT e.deposit_id AS "depositId", e.eure_in_raw AS "eureInRaw", e.usdc_net_raw AS "usdcNetRaw"
       FROM monerium_conversion_executions AS e
       JOIN monerium_fiat_deposits AS d ON d.id = e.deposit_id
       LEFT JOIN monerium_recoveries AS r ON r.deposit_id = e.deposit_id
       WHERE e.kind = 'recover' AND e.status = 'confirmed' AND d.status = 'recovering' AND r.id IS NULL
       ORDER BY e.created_at ASC
       LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    if (moved.length === 0) return;
    recovery = await MoneriumRecovery.create({
      depositId: moved[0].depositId,
      eureRecoveredRaw: moved[0].eureInRaw,
      phase: MoneriumRecoveryPhase.Moved,
      usdcRecoveredRaw: moved[0].usdcNetRaw ?? "0"
    });
  }
  const deposit = await MoneriumFiatDeposit.findByPk(recovery.depositId);
  if (!deposit) return;
  if (deposit.status === MoneriumFiatDepositStatus.RecoveryFailed) {
    logger.error(
      `monerium-b2b: refund of deposit ${deposit.id} waits for the operator (${recovery.error}); the refund queue is blocked`
    );
    return;
  }
  if (deposit.status === MoneriumFiatDepositStatus.Refunded) {
    await recovery.update({ phase: MoneriumRecoveryPhase.Redeemed }); // closed by hand
    return;
  }
  if (recovery.error) {
    await recovery.update({ attempts: 0, error: null }); // operator retry: resume from the preserved phase
  }
  const account = await MoneriumAccount.findByPk(deposit.accountId);
  if (!account) return;
  try {
    const deps = await depsFor(account.forwarderAddress as Address);
    await driveRecovery(recovery, deposit, deps);
  } catch (error) {
    logger.error(`monerium-b2b: refund step for deposit ${deposit.id} errored:`, error);
  }
}
