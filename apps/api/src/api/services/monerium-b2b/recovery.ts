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
  getRefundWalletClient,
  KeeperWalletClient,
  moneriumChainForChainId,
  readEnabledRoutes,
  swapRouter02Abi
} from "./chain";
import { errorText, markDepositForRecovery, RECEIPT_TIMEOUT_MS } from "./conversion-executor";
import { isForwardTransition, withForwarderLock } from "./deposit-processor";
import { UNATTRIBUTED_ORDER_PREFIX } from "./mint-watcher";
import { refundAccountFor } from "./refund-wallet";

/**
 * The refund path (docs/architecture-monerium-b2b-onramp.md, "the refund path"):
 *
 *  1. `runRecoveryDeadlines` marks a settling deposit `recovering` once its mint is older
 *     than the promised window (MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES), or only alerts,
 *     depending on MONERIUM_B2B_AUTO_RECOVERY. The keeper then sends `recover` once the
 *     clone's batch is RECOVERY_DELAY old (conversion-executor.ts).
 *  2. `runRecoveryOrchestrator` drives each client's oldest open recovery from the confirmed
 *     `recover` to the bank refund, on the client's own refund wallet (the clone's `recoveryAddress`,
 *     derived in refund-wallet.ts and linked to the client's Monerium profile): reverse-swap
 *     the USDC, top the wallet up from the EURe float to exactly the refund amount (or
 *     sweep a surplus back to the float), place the Monerium redeem order to the payer's
 *     IBAN, which pays out of the client's own IBAN, and mark the deposit `refunded` when
 *     Monerium processed it.
 *
 * Crash safety rests on the refund wallet being dedicated and empty between refunds:
 * every step re-derives what is still to do from the wallet's balances, so a lost
 * transaction hash never repeats a value-moving send (a top-up already on chain makes the
 * remaining need zero). One recovery at a time PER CLIENT is what keeps those balances
 * meaningful: the executor refuses a second `recover` for an account while one is in flight
 * (`activeRecoveryExists`), and the orchestrator opens a client's next recovery only after
 * its previous one is redeemed. Clients do not wait for each other; a refund parked in
 * `recovery_failed` blocks only its own client's later refunds. A step that fails beyond
 * its retries parks the deposit in `recovery_failed` with the phase preserved; an operator
 * retry (deposit back to `recovering`) resumes there, and a
 * refund the operator completed by hand is closed by setting the deposit `refunded`.
 */

export const REFUND_MEMO_PREFIX = "vortex-refund:";
/** Monerium requires a supporting document above this amount; such refunds stay manual (rollout G1). */
export const SUPPORTING_DOCUMENT_THRESHOLD_EUR = 15_000;
/** Gas the refund wallet's own transactions use (approve, reverse swap, surplus transfer), with margin. */
const REFUND_WALLET_GAS_UNITS = 400_000n;
const MAX_ATTEMPTS = 5;
const EURE_DECIMALS = 18;
const USDC_DECIMALS = 6;
const BPS = 10_000n;

// ------------------------------------------------------------------ pure helpers

/**
 * Reverses a packed Uniswap V3 path so the same pools run the other way. The factory only
 * admits token(20) fee(3) token(20) and token fee token fee token, so the two hex layouts
 * are sliced directly.
 */
export function reversePath(path: Hex): Hex {
  const hex = path.slice(2);
  if (hex.length === 86) return `0x${hex.slice(46)}${hex.slice(40, 46)}${hex.slice(0, 40)}`;
  if (hex.length === 132)
    return `0x${hex.slice(92)}${hex.slice(86, 92)}${hex.slice(46, 86)}${hex.slice(40, 46)}${hex.slice(0, 40)}`;
  throw new Error(`unexpected packed path length ${hex.length / 2}`);
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
  /** Sends the reverse swap from the client's refund wallet; returns the swap tx hash. */
  sendReverseSwap(amountIn: bigint, minOut: bigint, path: Hex): Promise<Hex>;
  sendEure(from: "float" | "recovery", to: Address, amount: bigint): Promise<Hex>;
  waitReceipt(hash: Hex): Promise<"reverted" | "success">;
  moneriumChain(): Promise<string>;
  listOrdersByMemo(address: Address, memo: string): Promise<Array<{ id: string; rejectedReason?: string; state: string }>>;
  createRedeemOrder(request: MoneriumRedeemOrderRequest): Promise<{ id: string | null }>;
  getOrder(orderId: string): Promise<{ rejectedReason?: string; state: string }>;
  signMessage(message: string): Promise<string>;
  /** Forward-only deposit transition under the forwarder lock: why it was refused, or null once the deposit has `status`. */
  setDepositStatus(deposit: MoneriumFiatDeposit, status: MoneriumFiatDepositStatus): Promise<string | null>;
  now(): Date;
}

function requireClient(client: KeeperWalletClient | null, name: string): KeeperWalletClient {
  if (!client) throw new Error(`${name} is not configured`);
  return client;
}

/** Live dependencies: chain clients from ./chain, the shared Monerium client, the client's refund wallet and the float. */
export async function liveRecoveryDeps(account: MoneriumAccount): Promise<RecoveryDeps> {
  const client = getPublicClient();
  const immutables = await getForwarderImmutables(account.forwarderAddress as Address);
  const refundAccount = refundAccountFor(account.profileId);
  if (refundAccount.address.toLowerCase() !== immutables.recoveryAddress.toLowerCase()) {
    throw new Error(`MONERIUM_B2B_REFUND_SEED does not derive the recovery address of forwarder ${account.forwarderAddress}`);
  }
  const recovery = getRefundWalletClient(refundAccount);
  const float = requireClient(getFloatWalletClient(), "MONERIUM_B2B_FLOAT_PRIVATE_KEY");
  const balance = (token: Address, address: Address) =>
    client.readContract({ abi: erc20Abi, address: token, args: [address], functionName: "balanceOf" });
  const wallets = { float, recovery };
  // The refund wallet pays for its own approve, swap and surplus transfer: before it sends,
  // the float tops its ETH up to twice that cost at the current gas price. Balance-derived,
  // so a repeat after a crash sends nothing once the first top-up landed.
  const fundRefundGas = async () => {
    const need = (await client.getGasPrice()) * REFUND_WALLET_GAS_UNITS;
    const held = await client.getBalance({ address: recovery.account.address });
    if (held >= need) return;
    const hash = await float.sendTransaction({ chain: null, to: recovery.account.address, value: 2n * need - held });
    await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  };
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
      if (from === "recovery") await fundRefundGas();
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
      await fundRefundGas();
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
    const refusal = await markDepositForRecovery(deposit.id, "window_missed");
    if (refusal) {
      logger.warn(`monerium-b2b: deposit ${deposit.id} is past its window but cannot be marked yet: ${refusal}`);
    } else {
      logger.warn(`monerium-b2b: deposit ${deposit.id} missed the ${ageMinutes} min window; marked for recovery`);
    }
  }
}

// ------------------------------------------------------------------ orchestrator

/**
 * True while a recovered payment is (or is about to be) on the account's refund wallet: a
 * `recover` execution that is pending or confirmed whose deposit has not left the refund
 * path. The executor refuses to send another `recover` for that account meanwhile.
 */
export async function activeRecoveryExists(accountId: string): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT e.id
     FROM monerium_conversion_executions AS e
     JOIN monerium_fiat_deposits AS d ON d.id = e.deposit_id
     LEFT JOIN monerium_recoveries AS r ON r.deposit_id = e.deposit_id
     WHERE e.account_id = :accountId
       AND e.kind = 'recover'
       AND e.status IN ('pending', 'confirmed')
       AND d.status IN ('recovering', 'recovery_failed')
       AND (r.id IS NULL OR r.phase <> 'redeemed')
     LIMIT 1`,
    { replacements: { accountId }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

/** Forward-only status change under the forwarder lock: why it was refused, or null once the deposit has `status`. */
export async function setDepositStatus(
  deposit: MoneriumFiatDeposit,
  status: MoneriumFiatDepositStatus
): Promise<string | null> {
  const account = await MoneriumAccount.findByPk(deposit.accountId);
  if (!account) return "Monerium account not found";
  return withForwarderLock(account.forwarderAddress, async transaction => {
    const current = await MoneriumFiatDeposit.findByPk(deposit.id, { transaction });
    if (!current) return "missing";
    if (current.status === status) return null;
    if (!isForwardTransition(current.status, status)) {
      return `Monerium deposit cannot transition from ${current.status} to ${status}`;
    }
    await current.update({ status }, { transaction });
    return null;
  });
}

async function fail(
  recovery: MoneriumRecovery,
  deposit: MoneriumFiatDeposit,
  deps: RecoveryDeps,
  reason: string
): Promise<void> {
  // Park before recording `error`: an error on a deposit still `recovering` reads as the operator's retry.
  const refusal = await deps.setDepositStatus(deposit, MoneriumFiatDepositStatus.RecoveryFailed);
  if (refusal) {
    logger.error(`monerium-b2b: deposit ${deposit.id} could not be parked as recovery_failed (${reason}): ${refusal}`);
    return;
  }
  logger.error(`monerium-b2b: REFUND FAILED — deposit ${deposit.id} in phase ${recovery.phase}: ${reason} (runbook §2.7)`);
  await recovery.update({ error: reason.slice(0, 500) });
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
  // `error` stays for the terminal failure: the orchestrator reads it as the operator's retry.
  await recovery.update({ attempts, phase });
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
        // USDC was recovered, yet neither it nor a swap's output shows: a node behind the
        // recover's block, not a landed swap. Read again next cycle instead of topping up.
        if (BigInt(recovery.usdcRecoveredRaw) > 0n && fromSwap === 0n) return;
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
        // Only the transfer just sent may carry a hash: ToppingUp waits on whichever is set.
        await recovery.update({
          floatTopupRaw: topUp.toString(),
          floatTopupTxHash: hash,
          phase: MoneriumRecoveryPhase.ToppingUp,
          surplusTxHash: null
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
        await recovery.update({
          floatTopupTxHash: null,
          phase: MoneriumRecoveryPhase.ToppingUp,
          surplusRaw: surplus.toString(),
          surplusTxHash: hash
        });
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
        // The deposit first: a redeemed recovery leaves every open query, so it could never retry.
        const refusal = await deps.setDepositStatus(deposit, MoneriumFiatDepositStatus.Refunded);
        if (refusal) {
          logger.error(
            `monerium-b2b: deposit ${deposit.id} was refunded (order ${recovery.redeemOrderId}) but could not be marked refunded: ${refusal}`
          );
          return;
        }
        await recovery.update({ error: null, phase: MoneriumRecoveryPhase.Redeemed });
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

/** Phases whose step may send from the shared float (reverse swap and top-up fund the refund wallet's gas or EURe). */
const FLOAT_PHASES: ReadonlySet<MoneriumRecoveryPhase> = new Set([MoneriumRecoveryPhase.Moved, MoneriumRecoveryPhase.Swapped]);
/** No new step starts once a cycle has spent this long (each step may wait on a receipt). */
const CYCLE_BUDGET_MS = 90_000;

/** Opens the oldest confirmed `recover` of every client that has no open recovery. */
async function openRecoveries(): Promise<void> {
  const moved = await sequelize.query<{ depositId: string; eureInRaw: string; usdcNetRaw: string }>(
    `SELECT DISTINCT ON (d.account_id)
            e.deposit_id AS "depositId", e.eure_in_raw AS "eureInRaw", e.usdc_net_raw AS "usdcNetRaw"
     FROM monerium_conversion_executions AS e
     JOIN monerium_fiat_deposits AS d ON d.id = e.deposit_id
     LEFT JOIN monerium_recoveries AS r ON r.deposit_id = e.deposit_id
     WHERE e.kind = 'recover' AND e.status = 'confirmed' AND d.status = 'recovering' AND r.id IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM monerium_recoveries AS open
         JOIN monerium_fiat_deposits AS open_deposit ON open_deposit.id = open.deposit_id
         WHERE open_deposit.account_id = d.account_id AND open.phase <> 'redeemed'
       )
     ORDER BY d.account_id, e.created_at ASC`,
    { type: QueryTypes.SELECT }
  );
  for (const row of moved) {
    try {
      await MoneriumRecovery.create({
        depositId: row.depositId,
        eureRecoveredRaw: row.eureInRaw,
        phase: MoneriumRecoveryPhase.Moved,
        usdcRecoveredRaw: row.usdcNetRaw ?? "0"
      });
    } catch (error) {
      // One client's failed insert must not stop the other clients' refunds from being stepped.
      logger.error(`monerium-b2b: could not open the refund of deposit ${row.depositId}:`, error);
    }
  }
}

/** One step of one client's open recovery: parked and closed ones are handled here, the rest are driven. */
async function stepRecovery(
  recovery: MoneriumRecovery,
  deposit: MoneriumFiatDeposit,
  depsFor: (account: MoneriumAccount) => Promise<RecoveryDeps>,
  onFloatSend: () => void
): Promise<void> {
  if (deposit.status === MoneriumFiatDepositStatus.RecoveryFailed) {
    logger.error(
      `monerium-b2b: refund of deposit ${deposit.id} waits for the operator (${recovery.error}); that client's refund queue is blocked`
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
    const deps = await depsFor(account);
    // The float is touched only by these two sends (EURe top-up, and the gas top-up inside both).
    const tracked: RecoveryDeps = {
      ...deps,
      sendEure: (...args) => {
        onFloatSend();
        return deps.sendEure(...args);
      },
      sendReverseSwap: (...args) => {
        onFloatSend();
        return deps.sendReverseSwap(...args);
      }
    };
    await driveRecovery(recovery, deposit, tracked);
  } catch (error) {
    logger.error(`monerium-b2b: refund step for deposit ${deposit.id} errored:`, error);
  }
}

/**
 * Runs one step of every client's oldest open recovery, after opening the next one for
 * each client that has none: the oldest deposit in `recovering` whose `recover` execution
 * is confirmed and that has no recovery row yet. A recovery whose deposit is
 * `recovery_failed` waits for the operator and blocks only its own client's queue.
 *
 * Each client's refund wallet is its own, so clients advance one step per cycle each; the one
 * shared resource is the EURe float wallet, which sends with implicit nonces and no
 * coherent pending pool. So per cycle: steps that cannot touch the float run concurrently
 * (a client's slow receipt wait does not hold the others' steps, though the cycle lasts
 * until the slowest wait ends: a cycle can last several minutes, since each receipt wait
 * times out after 3 minutes and a float step can wait on more than one); alongside them at
 * most one step that sends from the float runs, and none while an earlier float transfer is still unconfirmed (a
 * `topping_up` recovery waiting on its receipt, unless parked). Float steps are taken oldest
 * first; one that sends nothing (float underfunded, nothing to swap) does not use the slot.
 */
export async function runRecoveryOrchestrator(
  depsFor: (account: MoneriumAccount) => Promise<RecoveryDeps> = liveRecoveryDeps
): Promise<void> {
  await openRecoveries();
  const open = await MoneriumRecovery.findAll({
    order: [["created_at", "ASC"]],
    where: { phase: { [Op.ne]: MoneriumRecoveryPhase.Redeemed } }
  });
  if (open.length === 0) return;
  const deposits = await MoneriumFiatDeposit.findAll({ where: { id: open.map(row => row.depositId) } });
  const depositById = new Map(deposits.map(deposit => [deposit.id, deposit]));
  // The oldest open recovery of each client (rows are oldest first).
  const heads = new Map<string, { deposit: MoneriumFiatDeposit; recovery: MoneriumRecovery }>();
  for (const recovery of open) {
    const deposit = depositById.get(recovery.depositId);
    if (deposit && !heads.has(deposit.accountId)) heads.set(deposit.accountId, { deposit, recovery });
  }

  const startedAt = Date.now();
  let floatSent = false;
  const onFloatSend = () => {
    floatSent = true;
  };
  const queue = [...heads.values()];
  // A float transfer of a recovery (not parked: it is never stepped) that still waits for its receipt.
  const holdsFloatTransfer = ({ deposit, recovery }: (typeof queue)[number]) =>
    recovery.phase === MoneriumRecoveryPhase.ToppingUp &&
    Boolean(recovery.floatTopupTxHash) &&
    deposit.status !== MoneriumFiatDepositStatus.RecoveryFailed;
  const step = ({ deposit, recovery }: (typeof queue)[number]) =>
    stepRecovery(recovery, deposit, depsFor, onFloatSend).catch(error =>
      logger.error(`monerium-b2b: refund step for deposit ${deposit.id} failed:`, error)
    );
  // Parked and refunded heads return before any send; any other head in a float phase can touch the float.
  const floatCapable = ({ deposit, recovery }: (typeof queue)[number]) =>
    FLOAT_PHASES.has(recovery.phase) &&
    deposit.status !== MoneriumFiatDepositStatus.RecoveryFailed &&
    deposit.status !== MoneriumFiatDepositStatus.Refunded;
  // Float-free steps use only their own client's wallet, so a slow receipt wait (up to RECEIPT_TIMEOUT_MS) does not hold the others' steps in this cycle.
  const gating = queue.filter(head => !floatCapable(head) && holdsFloatTransfer(head));
  // Partitioned before any step starts: the running steps mutate their recoveries, and a client stepped once must not be stepped again this cycle.
  const floatHeads = queue.filter(floatCapable);
  const floatFreeSteps = queue.filter(head => !floatCapable(head)).map(head => [head, step(head)] as const);
  // The float stage waits only for the steps that gate it, not for every slow receipt.
  await Promise.all(floatFreeSteps.filter(([head]) => gating.includes(head)).map(([, running]) => running));
  for (const head of floatHeads) {
    if (floatSent || Date.now() - startedAt > CYCLE_BUDGET_MS) break;
    const gate = queue.find(holdsFloatTransfer);
    if (gate) {
      logger.warn(`monerium-b2b: float steps wait for the unconfirmed float transfer of deposit ${gate.deposit.id}`);
      break;
    }
    // The gating wait can be long: step the head as the operator left it (parked, closed or moved on) in the meantime.
    const { deposit, recovery } = head;
    try {
      await Promise.all([deposit.reload(), recovery.reload()]);
    } catch (error) {
      logger.error(`monerium-b2b: could not reload the refund of deposit ${deposit.id}:`, error);
      continue;
    }
    await step(head);
  }
  await Promise.all(floatFreeSteps.map(([, running]) => running));
}
