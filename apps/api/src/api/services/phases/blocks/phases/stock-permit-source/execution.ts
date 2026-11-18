import {
  checkEvmBalancePeriodically,
  EvmClientManager,
  Networks,
  type PresignedTx,
  RampDirection,
  type RampPhase
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { encodeFunctionData, erc20Abi, keccak256, parseAbi } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { verifyUserSubmittedTxByHash } from "../../../../phases/helpers/user-tx-verifier";
import { validatePresignedTxs } from "../../../../transactions/validation";
import { throwIfAborted } from "../../core/cancellation";
import { runSerializedEvmFundingOperation, sendEvmFundingTransaction } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockState } from "../../core/metadata";
import { isStockSymbol, readStockFlags } from "../../core/robinhood-stocks";
import { moneriumPermitAbi } from "../monerium-self-transfer/contract";
import { resolveUniswapRoute } from "../uniswap-v3-fixed-swap/route";
import { STOCK_PERMIT_GAS_LIMIT, StockPermitSourceContext } from "./simulation";
import { stockSourcePin } from "./source";
import type { StockPermitSourceState } from "./transactions";
import { readStockPermit, readStockTransfer, type StockPermitExpectation, type ValidatedStockPermit } from "./validation";

const USER_TRANSFER_BALANCE_POLL_MS = 5000;
const USER_TRANSFER_BALANCE_TIMEOUT_MS = 3 * 60 * 1000;

const noncesAbi = parseAbi(["function nonces(address owner) view returns (uint256)"]);

type ExecutionState = StockPermitSourceState & {
  allowanceBeforeTransferRaw?: string;
  permitInvalidation?: { reason: "expired" | "nonce-consumed"; observedNonce: string };
  permitTxHash?: `0x${string}`;
  transferTxHash?: `0x${string}`;
};

interface Receipt {
  status: "success" | "reverted";
}

export interface StockPermitExecutionDependencies {
  getAllowance(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint>;
  getBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  getPermitNonce(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  getTransactionCount(address: `0x${string}`): Promise<number>;
  now(): number;
  /** What the pinned pool pays now for the sold amount, and the swap's soft minimum. */
  quoteSale(state: RampState, ephemeral: `0x${string}`): Promise<{ outputRaw: bigint; softMinimumOutputRaw: bigint }>;
  readStockFlags: typeof readStockFlags;
  sendPermit(
    token: `0x${string}`,
    args: readonly [`0x${string}`, `0x${string}`, bigint, bigint, number, `0x${string}`, `0x${string}`]
  ): Promise<`0x${string}`>;
  sendRawTransaction(transaction: `0x${string}`): Promise<`0x${string}`>;
  verifyUserTransfer: typeof verifyUserSubmittedTxByHash;
  waitForBalance(token: `0x${string}`, owner: `0x${string}`, amountRaw: string, signal?: AbortSignal): Promise<unknown>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(network: typeof Networks.Base | typeof Networks.Robinhood): StockPermitExecutionDependencies {
  const manager = EvmClientManager.getInstance();
  const client = manager.getClient(network);
  return {
    getAllowance: (token, owner, spender) =>
      client.readContract({ abi: erc20Abi, address: token, args: [owner, spender], functionName: "allowance" }),
    getBalance: (token, owner) =>
      client.readContract({ abi: erc20Abi, address: token, args: [owner], functionName: "balanceOf" }),
    getPermitNonce: (token, owner) =>
      client.readContract({ abi: noncesAbi, address: token, args: [owner], functionName: "nonces" }),
    async getReceipt(hash) {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    getTransactionCount: address => client.getTransactionCount({ address }),
    now: Date.now,
    async quoteSale(state, ephemeral) {
      const quote = await QuoteTicket.findByPk(state.quoteId);
      if (!quote) throw new Error("the quote is missing");
      const route = resolveUniswapRoute(quote.metadata, state.state, ephemeral);
      return {
        outputRaw: await route.quote(BigInt(route.amountInRaw)),
        softMinimumOutputRaw: BigInt(route.softMinimumOutputRaw)
      };
    },
    readStockFlags,
    sendPermit: (token, args) =>
      sendEvmFundingTransaction(network, {
        data: encodeFunctionData({ abi: moneriumPermitAbi, args, functionName: "permit" }),
        gas: STOCK_PERMIT_GAS_LIMIT,
        to: token
      }),
    sendRawTransaction: async transaction => (await manager.sendRawTransactionWithRetry(network, transaction)) as `0x${string}`,
    verifyUserTransfer: verifyUserSubmittedTxByHash,
    waitForBalance: (token, owner, amountRaw, signal) =>
      checkEvmBalancePeriodically(
        token,
        owner,
        amountRaw,
        USER_TRANSFER_BALANCE_POLL_MS,
        USER_TRANSFER_BALANCE_TIMEOUT_MS,
        network,
        signal
      ),
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

/**
 * Moves the sold stock onto the ephemeral: the funding wallet submits the seller's permit and the ephemeral pulls the
 * tokens, or, for a token without a permit, the seller's own reported transfer is verified. Until the pull, the seller
 * still holds the tokens, so only then may a dead end fail the ramp.
 */
export class StockPermitTransferExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: StockPermitExecutionDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "stockPermitTransfer";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const { amountRaw, isNoPermitFallback, owner, token } = this.getState(state);
    const ephemeral = state.state.evmEphemeralAddress as `0x${string}` | undefined;
    if (!ephemeral) throw this.createUnrecoverableError("StockPermitSource is missing its EVM ephemeral account");
    const expectation: StockPermitExpectation = {
      amountRaw,
      ephemeral,
      owner: owner as `0x${string}`,
      tokenAddress: stockSourcePin(token).address
    };
    const dependencies = this.injectedDependencies ?? defaultDependencies(this.sourceNetwork(state));
    try {
      if (isStockSymbol(token)) {
        const { paused } = await dependencies.readStockFlags(token);
        if (paused) throw this.createRecoverableError(`StockPermitSource: trading in ${token} is paused by the issuer`);
      }
      if (isNoPermitFallback) {
        await dependencies.verifyUserTransfer({
          fromNetwork: this.sourceNetwork(state),
          hash: state.state.squidRouterNoPermitTransferHash as `0x${string}` | undefined,
          label: "User stock transfer to ephemeral",
          presignedPhase: "squidRouterNoPermitTransfer",
          signal,
          state
        });
        await dependencies.waitForBalance(expectation.tokenAddress, ephemeral, amountRaw, signal);
        return state;
      }
      const permitTx = await this.validatedPermitTransactions(state, expectation);
      await this.consumeOrInvalidatePermit(state, dependencies, expectation, permitTx.permit, signal);
      await this.pullTokens(state, dependencies, expectation, permitTx, signal);
      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      throw this.createRecoverableError(`StockPermitSource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Nothing has moved when these first fail, and no retry can change a presigned transaction. */
  private async validatedPermitTransactions(
    state: RampState,
    expectation: StockPermitExpectation
  ): Promise<{ permit: ValidatedStockPermit; transferTx: PresignedTx }> {
    try {
      const permitTx = this.findTransaction(state, expectation.owner);
      const transferTx = this.findTransaction(state, expectation.ephemeral);
      await validatePresignedTxs(
        RampDirection.SELL,
        [permitTx, transferTx],
        { EVM: expectation.ephemeral, Substrate: "" },
        state.unsignedTxs,
        { requireComplete: false }
      );
      return { permit: readStockPermit(permitTx, expectation), transferTx };
    } catch (error) {
      throw this.createUnrecoverableError(
        `StockPermitSource: presigned transactions are invalid: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** The swap holds below its soft minimum, so the tokens wait in the seller's wallet rather than on the ephemeral. */
  private async assertSaleCanProceed(
    state: RampState,
    dependencies: StockPermitExecutionDependencies,
    { amountRaw, ephemeral, owner, tokenAddress }: StockPermitExpectation
  ): Promise<void> {
    const balance = await dependencies.getBalance(tokenAddress, owner);
    if (balance < BigInt(amountRaw)) {
      throw this.createRecoverableError(`StockPermitSource: owner holds ${balance}, below the ${amountRaw} sold`);
    }
    const { outputRaw, softMinimumOutputRaw } = await dependencies.quoteSale(state, ephemeral);
    if (outputRaw < softMinimumOutputRaw) {
      throw this.createRecoverableError(
        `StockPermitSource: the pool pays ${outputRaw}, below the swap's soft minimum ${softMinimumOutputRaw}`
      );
    }
  }

  private async consumeOrInvalidatePermit(
    state: RampState,
    dependencies: StockPermitExecutionDependencies,
    expectation: StockPermitExpectation,
    permit: ValidatedStockPermit,
    signal?: AbortSignal
  ): Promise<void> {
    const { amountRaw, ephemeral, owner, tokenAddress } = expectation;
    const currentNonce = await dependencies.getPermitNonce(tokenAddress, owner);
    if (currentNonce < permit.nonce) {
      throw this.createRecoverableError(`StockPermitSource: owner nonce ${currentNonce} is behind permit ${permit.nonce}`);
    }
    const expired = permit.deadline <= BigInt(Math.floor(dependencies.now() / 1000));
    if (!this.getState(state).permitTxHash && (currentNonce > permit.nonce || expired)) {
      await this.updateState(state, {
        permitInvalidation: {
          observedNonce: currentNonce.toString(),
          reason: currentNonce > permit.nonce ? "nonce-consumed" : "expired"
        }
      });
      return;
    }

    const settle = (hash: `0x${string}`, receipt: Receipt | null): { hash: `0x${string}` } | null => {
      if (!receipt) return null;
      if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Stock permit ${hash} reverted`);
      return { hash };
    };
    try {
      await runSerializedEvmFundingOperation(
        this.sourceNetwork(state),
        () =>
          this.runFinancialOperation(state, {
            attemptClass: "stock-permit",
            beforePerform: () => this.assertSaleCanProceed(state, dependencies, expectation),
            externalId: value => value.hash,
            perform: async () => {
              throwIfAborted(signal);
              const hash = await dependencies.sendPermit(tokenAddress, [
                owner,
                ephemeral,
                BigInt(amountRaw),
                permit.deadline,
                permit.signature.v,
                permit.signature.r,
                permit.signature.s
              ]);
              await this.updateState(state, { permitTxHash: hash });
              const result = settle(hash, await dependencies.waitForReceipt(hash));
              if (!result) throw new Error(`Stock permit ${hash} has no receipt`);
              return result;
            },
            provider: this.sourceNetwork(state),
            reconcile: async () => {
              const hash = this.getState(state).permitTxHash;
              return hash ? settle(hash, await dependencies.getReceipt(hash)) : null;
            },
            request: {
              deadline: permit.deadline.toString(),
              nonce: permit.nonce.toString(),
              owner,
              spender: ephemeral,
              tokenAddress,
              value: amountRaw
            },
            retryFailed: true,
            settleAfterAbort: true,
            signal
          }),
        signal
      );
    } catch (error) {
      if (!(error instanceof FinancialOperationRejectedError)) throw error;
      // A mined revert moved nothing. Resending cannot change it, unless another transaction consumed the nonce and
      // set the allowance, which the pull then uses.
      const observedNonce = await dependencies.getPermitNonce(tokenAddress, owner);
      if (observedNonce <= permit.nonce) {
        throw this.createUnrecoverableError(`StockPermitSource: ${error.message}, so the seller still holds the tokens`);
      }
      await this.updateState(state, {
        permitInvalidation: { observedNonce: observedNonce.toString(), reason: "nonce-consumed" },
        permitTxHash: undefined
      });
      return;
    }
    const consumedNonce = await dependencies.getPermitNonce(tokenAddress, owner);
    if (consumedNonce <= permit.nonce) {
      throw this.createReconciliationRequiredError("Stock permit receipt succeeded without consuming its token nonce");
    }
  }

  private async pullTokens(
    state: RampState,
    dependencies: StockPermitExecutionDependencies,
    expectation: StockPermitExpectation,
    { permit, transferTx }: { permit: ValidatedStockPermit; transferTx: PresignedTx },
    signal?: AbortSignal
  ): Promise<void> {
    const { amountRaw, ephemeral, owner, tokenAddress } = expectation;
    // The seller agreed to a sale within the permit's lifetime, so a pull that has not started by then never starts.
    const assertBeforeDeadline = () => {
      if (permit.deadline <= BigInt(Math.floor(dependencies.now() / 1000))) {
        throw this.createUnrecoverableError(
          "StockPermitSource: the permit deadline passed before the pull, so the seller still holds the tokens"
        );
      }
    };
    const observedAllowance = await dependencies.getAllowance(tokenAddress, owner, ephemeral);
    const persistedAllowance = this.getState(state).allowanceBeforeTransferRaw;
    const allowanceBefore = persistedAllowance ? BigInt(persistedAllowance) : observedAllowance;
    if (allowanceBefore < BigInt(amountRaw)) {
      // The allowance is persisted before the pull, so without one the pull never ran and the seller holds the tokens.
      const invalidation = this.getState(state).permitInvalidation;
      if (invalidation) {
        throw this.createUnrecoverableError(
          invalidation.reason === "expired"
            ? "StockPermitSource: the permit expired unused, so the seller still holds the tokens"
            : `StockPermitSource: owner nonce ${invalidation.observedNonce} consumed the permit and no allowance remains, so the seller still holds the tokens`
        );
      }
      assertBeforeDeadline();
      throw this.createRecoverableError("StockPermitSource: the permit did not establish the transfer allowance");
    }
    if (!persistedAllowance) await this.updateState(state, { allowanceBeforeTransferRaw: allowanceBefore.toString() });

    const { nonce, transaction } = readStockTransfer(transferTx, expectation);
    const deterministicHash = keccak256(transaction);
    if (!this.getState(state).transferTxHash) {
      const currentNonce = await dependencies.getTransactionCount(ephemeral);
      if (currentNonce !== nonce || observedAllowance !== allowanceBefore) {
        const receipt = await dependencies.getReceipt(deterministicHash);
        if (receipt?.status !== "success") {
          throw this.createReconciliationRequiredError(
            currentNonce !== nonce
              ? `StockPermitSource: signed nonce ${nonce} does not match current nonce ${currentNonce}`
              : "StockPermitSource: allowance changed before the transfer"
          );
        }
      }
    }

    const settle = (receipt: Receipt | null): { hash: `0x${string}` } | null => {
      if (!receipt) return null;
      if (receipt.status !== "success") {
        throw new FinancialOperationRejectedError(`Stock transferFrom ${deterministicHash} reverted`);
      }
      return { hash: deterministicHash };
    };
    try {
      await this.runFinancialOperation(state, {
        attemptClass: "stock-permit-transfer-from",
        beforePerform: () => {
          assertBeforeDeadline();
          return this.assertSaleCanProceed(state, dependencies, expectation);
        },
        externalId: value => value.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await dependencies.sendRawTransaction(transaction);
          if (hash.toLowerCase() !== deterministicHash.toLowerCase()) {
            throw new Error(`Stock transferFrom returned hash ${hash}, expected ${deterministicHash}`);
          }
          await this.updateState(state, { transferTxHash: hash });
          const result = settle(await dependencies.waitForReceipt(hash));
          if (!result) throw new Error(`Stock transferFrom ${hash} has no receipt`);
          return result;
        },
        provider: this.sourceNetwork(state),
        reconcile: async () => settle(await dependencies.getReceipt(deterministicHash)),
        reconcileRequestMismatch: true,
        request: { network: this.sourceNetwork(state), signedTransaction: transaction },
        settleAfterAbort: true,
        signal
      });
    } catch (error) {
      // A mined revert spent the signed nonce, so this pull can never be repeated. The tokens never left the seller.
      if (
        error instanceof FinancialOperationRejectedError ||
        (error instanceof APIError && error.status === httpStatus.CONFLICT)
      ) {
        throw this.createUnrecoverableError(`StockPermitSource: ${error.message}`);
      }
      throw error;
    }

    const allowanceAfter = await dependencies.getAllowance(tokenAddress, owner, ephemeral);
    if (allowanceAfter !== allowanceBefore - BigInt(amountRaw)) {
      throw this.createReconciliationRequiredError(
        `StockPermitSource: allowance is ${allowanceAfter}, expected ${allowanceBefore - BigInt(amountRaw)} after the transfer`
      );
    }
    logger.info(`StockPermitSource confirmed exact transfer ${deterministicHash}`);
  }

  private sourceNetwork(state: RampState): typeof Networks.Base | typeof Networks.Robinhood {
    return stockSourcePin(this.getState(state).token).network;
  }

  private findTransaction(state: RampState, signer: string): PresignedTx {
    const transaction = (state.presignedTxs ?? []).find(
      value => value.phase === this.getPhaseName() && value.signer.toLowerCase() === signer.toLowerCase()
    );
    if (!transaction) throw new Error(`no presigned transaction from ${signer}`);
    return transaction;
  }

  private getState(state: RampState): ExecutionState {
    try {
      return getBlockState<ExecutionState>(state.state, StockPermitSourceContext);
    } catch (error) {
      throw this.createUnrecoverableError(`StockPermitSource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateState(state: RampState, patch: Partial<ExecutionState>): Promise<void> {
    await state.update({
      state: {
        ...state.state,
        blockState: { ...state.state.blockState, [StockPermitSourceContext.key]: { ...this.getState(state), ...patch } }
      }
    });
  }
}
