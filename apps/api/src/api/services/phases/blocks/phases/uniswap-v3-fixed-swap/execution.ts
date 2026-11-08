import { EvmClientManager, type PresignedTx, type RampPhase } from "@vortexfi/shared";
import { erc20Abi, isAddressEqual, keccak256, parseTransaction, recoverTransactionAddress } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import type { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { validatePresignedEvmTransactionAgainstUnsigned } from "../../../../transactions/validation";
import { throwIfAborted } from "../../core/cancellation";
import { resendPresignedTransaction } from "../../core/evm-transactions";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { readStockFlags } from "../../core/robinhood-stocks";
import { classifyStockRouteFailure, resolveUniswapRoute, type UniswapRoute } from "./route";
import { validateUniswapApproval, validateUniswapSwap } from "./validation";

interface Receipt {
  status: "success" | "reverted";
}

export interface UniswapV3ExecutionDependencies {
  getAllowance(owner: `0x${string}`): Promise<bigint>;
  getBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  quote(amountIn: bigint): Promise<bigint>;
  readStockFlags?: typeof readStockFlags;
  sendRawTransaction(transaction: `0x${string}`): Promise<`0x${string}`>;
  simulateTransaction(transaction: `0x${string}`): Promise<void>;
  verifyDeployment(): Promise<void>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(route: UniswapRoute): UniswapV3ExecutionDependencies {
  const manager = EvmClientManager.getInstance();
  const client = manager.getClient(route.network);
  return {
    getAllowance: owner =>
      client.readContract({
        abi: erc20Abi,
        address: route.inputToken,
        args: [owner, route.router],
        functionName: "allowance"
      }),
    getBalance: (token, owner) =>
      client.readContract({ abi: erc20Abi, address: token, args: [owner], functionName: "balanceOf" }),
    async getReceipt(hash) {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    quote: route.quote,
    sendRawTransaction: async transaction =>
      (await manager.sendRawTransactionWithRetry(route.network, transaction)) as `0x${string}`,
    async simulateTransaction(transaction) {
      const parsed = parseTransaction(transaction);
      if (!parsed.to) throw new Error("Uniswap swap simulation is missing its router target");
      await client.call({
        account: await recoverTransactionAddress({
          serializedTransaction: transaction as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"]
        }),
        data: parsed.data,
        to: parsed.to,
        value: parsed.value
      });
    },
    verifyDeployment: route.verifyDeployment,
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

abstract class UniswapV3Executor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: UniswapV3ExecutionDependencies) {
    super();
  }

  protected abstract executeRoute(
    state: RampState,
    route: UniswapRoute,
    dependencies: UniswapV3ExecutionDependencies,
    signal?: AbortSignal
  ): Promise<RampState>;

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    // The input is already on the ephemeral, so a failed read is retried.
    const quote = await QuoteTicket.findByPk(state.quoteId).catch(error => {
      throw this.createRecoverableError(
        `Uniswap fixed swap quote cannot be read: ${error instanceof Error ? error.message : error}`
      );
    });
    if (!quote) throw this.createUnrecoverableError("Uniswap fixed swap quote is missing");
    const signer = state.state.evmEphemeralAddress;
    if (!signer) throw this.createUnrecoverableError("Uniswap fixed swap is missing its EVM ephemeral account");
    const route = resolveUniswapRoute(quote.metadata, state.state, signer as `0x${string}`);
    const dependencies = this.injectedDependencies ?? defaultDependencies(route);
    try {
      return await this.executeRoute(state, route, dependencies, signal);
    } catch (error) {
      throw route.stock ? classifyStockRouteFailure(error) : error;
    }
  }

  protected hold(state: RampState, route: UniswapRoute, reason: string): PhaseError {
    logger.warn(`UNISWAP_SWAP_HELD: ${reason}. ramp=${state.id} network=${route.network}`);
    return this.createRecoverableError(reason);
  }

  protected async holdWhileStockPaused(
    state: RampState,
    route: UniswapRoute,
    dependencies: UniswapV3ExecutionDependencies
  ): Promise<void> {
    if (!route.stock) return;
    const { paused } = await (dependencies.readStockFlags ?? readStockFlags)(route.stock);
    if (paused) throw this.hold(state, route, `Uniswap ${route.label} trading is paused by the issuer`);
  }

  protected holdBelowSoftMinimum(state: RampState, route: UniswapRoute, currentQuote: bigint): void {
    if (currentQuote < BigInt(route.softMinimumOutputRaw)) {
      throw this.hold(state, route, "Uniswap fixed swap quote moved below its soft minimum");
    }
  }

  protected findTransaction(transactions: readonly PresignedTx[], phase: RampPhase, label: string): PresignedTx {
    const transaction = transactions.find(value => value.phase === phase);
    if (!transaction) throw this.createUnrecoverableError(`Uniswap fixed swap is missing its ${label}`);
    return transaction;
  }

  /** No retry can change a presigned transaction, so on a stock route a bad one pauses for an operator. */
  protected async validatedTransaction(
    state: RampState,
    route: UniswapRoute,
    label: string,
    validate: typeof validateUniswapApproval
  ): Promise<`0x${string}`> {
    try {
      const signed = this.findTransaction(state.presignedTxs ?? [], this.getPhaseName(), `signed ${label}`);
      const unsigned = this.findTransaction(state.unsignedTxs, this.getPhaseName(), `${label} blueprint`);
      await validatePresignedEvmTransactionAgainstUnsigned(signed, unsigned);
      return await validate(signed, route);
    } catch (error) {
      if (!route.stock) throw error;
      throw this.createReconciliationRequiredError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Sends the presigned transaction inside the financial-operation journal. `settledReceipt` is a
   * successful receipt the caller already read for the transaction's deterministic hash: it lets a
   * row left `submitted` by an earlier crash become `confirmed` without another RPC read or resend.
   */
  protected async broadcast(
    state: RampState,
    route: UniswapRoute,
    transaction: `0x${string}`,
    dependencies: UniswapV3ExecutionDependencies,
    signal?: AbortSignal,
    settledReceipt?: Receipt
  ): Promise<`0x${string}`> {
    const deterministicHash = keccak256(transaction);
    const settle = (receipt: Receipt | null): { hash: `0x${string}` } | null => {
      if (!receipt) return null;
      if (receipt.status !== "success") {
        throw new FinancialOperationRejectedError(`Uniswap transaction ${deterministicHash} reverted`);
      }
      return { hash: deterministicHash };
    };
    const result = await this.runFinancialOperation(state, {
      attemptClass: "uniswap-presigned-broadcast",
      externalId: value => value.hash,
      perform: async () => {
        const known = settledReceipt ? settle(settledReceipt) : null;
        if (known) return known;
        throwIfAborted(signal);
        const hash = await dependencies.sendRawTransaction(transaction);
        if (hash.toLowerCase() !== deterministicHash.toLowerCase()) {
          throw new Error(`Uniswap transaction returned hash ${hash}, expected ${deterministicHash}`);
        }
        const receipt = await dependencies.waitForReceipt(hash);
        if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Uniswap transaction ${hash} reverted`);
        return { hash };
      },
      provider: route.network,
      reconcile: async () =>
        settle(
          settledReceipt ??
            (await dependencies.getReceipt(deterministicHash)) ??
            (await resendPresignedTransaction(transaction, dependencies))
        ),
      request: { network: route.network, signedTransaction: transaction },
      signal
    });
    return result.hash;
  }
}

export class UniswapApproveExecutor extends UniswapV3Executor {
  public getPhaseName(): RampPhase {
    return "uniswapApprove";
  }

  protected async executeRoute(
    state: RampState,
    route: UniswapRoute,
    dependencies: UniswapV3ExecutionDependencies,
    signal?: AbortSignal
  ): Promise<RampState> {
    const transaction = await this.validatedTransaction(state, route, "approval", validateUniswapApproval);
    await this.holdWhileStockPaused(state, route, dependencies);
    if (route.stock) {
      // A mined approval burns the first main nonce and with it the backup approval, so hold while that exit is still open.
      this.holdBelowSoftMinimum(state, route, await dependencies.quote(BigInt(route.amountInRaw)));
    }
    await this.broadcast(state, route, transaction, dependencies, signal);
    const allowance = await dependencies.getAllowance(route.signer);
    if (allowance !== BigInt(route.amountInRaw)) {
      throw this.createReconciliationRequiredError(
        `Uniswap approval established allowance ${allowance}, expected ${route.amountInRaw}`
      );
    }
    return state;
  }
}

export class UniswapSwapExecutor extends UniswapV3Executor {
  public getPhaseName(): RampPhase {
    return "uniswapSwap";
  }

  protected async executeRoute(
    state: RampState,
    route: UniswapRoute,
    dependencies: UniswapV3ExecutionDependencies,
    signal?: AbortSignal
  ): Promise<RampState> {
    const transaction = await this.validatedTransaction(state, route, "swap", validateUniswapSwap);
    // A swap that already settled on-chain has consumed the allowance, so the pre-flight checks can
    // never pass again. Skip them and hand the receipt to the journal, which then confirms its row
    // without a second read that could fail transiently and trigger a resend.
    const receipt = await dependencies.getReceipt(keccak256(transaction));
    const settledReceipt = receipt?.status === "success" ? receipt : undefined;
    if (!settledReceipt) {
      if (BigInt(route.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
        throw this.createRecoverableError("Uniswap fixed swap signature expired before settlement");
      }
      await this.holdWhileStockPaused(state, route, dependencies);
      await dependencies.verifyDeployment();
      const [inputBalance, allowance, currentQuote] = await Promise.all([
        dependencies.getBalance(route.inputToken, route.signer),
        dependencies.getAllowance(route.signer),
        dependencies.quote(BigInt(route.amountInRaw))
      ]);
      if (inputBalance < BigInt(route.amountInRaw)) {
        throw this.createRecoverableError(
          `Uniswap fixed swap input ${route.inputSymbol} has not reached the ephemeral account`
        );
      }
      if (allowance !== BigInt(route.amountInRaw)) {
        throw this.createReconciliationRequiredError(
          `Uniswap fixed swap allowance ${allowance} does not match ${route.amountInRaw}`
        );
      }
      this.holdBelowSoftMinimum(state, route, currentQuote);
      await dependencies.simulateTransaction(transaction);
    }
    await this.broadcast(state, route, transaction, dependencies, signal, settledReceipt);
    const remainingAllowance = await dependencies.getAllowance(route.signer);
    if (remainingAllowance !== 0n) {
      throw this.createReconciliationRequiredError(`Uniswap fixed swap left unexpected allowance ${remainingAllowance}`);
    }
    if (isAddressEqual(route.recipient, route.signer)) {
      const outputBalance = await dependencies.getBalance(route.outputToken, route.signer);
      if (outputBalance < BigInt(route.hardMinimumOutputRaw)) {
        throw this.createReconciliationRequiredError(
          `Uniswap fixed swap produced ${outputBalance} ${route.outputSymbol}, below ${route.hardMinimumOutputRaw}`
        );
      }
    }
    return state;
  }
}
