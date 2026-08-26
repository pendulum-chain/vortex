import { EvmClientManager, Networks, type PresignedTx, type RampPhase } from "@vortexfi/shared";
import { erc20Abi, keccak256, parseTransaction, recoverTransactionAddress } from "viem";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { validatePresignedEvmTransactionAgainstUnsigned } from "../../../../transactions/validation";
import { throwIfAborted } from "../../core/cancellation";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { POLYGON_EURE, POLYGON_UNISWAP_V3_ROUTER, POLYGON_USDC } from "./contract";
import { quotePolygonEureToUsdc, UniswapV3FixedSwapContext, verifyPolygonEureUsdcDeployment } from "./simulation";
import type { UniswapV3FixedSwapPreparation } from "./transactions";
import { type UniswapV3SwapExpectation, validateUniswapApproval, validateUniswapSwap } from "./validation";

interface Receipt {
  status: "success" | "reverted";
}

export interface UniswapV3ExecutionDependencies {
  getAllowance(owner: `0x${string}`): Promise<bigint>;
  getBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  quote(amountIn: bigint): Promise<bigint>;
  sendRawTransaction(transaction: `0x${string}`): Promise<`0x${string}`>;
  simulateTransaction(transaction: `0x${string}`): Promise<void>;
  verifyDeployment(): Promise<void>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(): UniswapV3ExecutionDependencies {
  const manager = EvmClientManager.getInstance();
  const client = manager.getClient(Networks.Polygon);
  return {
    getAllowance: owner =>
      client.readContract({
        abi: erc20Abi,
        address: POLYGON_EURE,
        args: [owner, POLYGON_UNISWAP_V3_ROUTER],
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
    quote: quotePolygonEureToUsdc,
    sendRawTransaction: async transaction =>
      (await manager.sendRawTransactionWithRetry(Networks.Polygon, transaction)) as `0x${string}`,
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
    verifyDeployment: verifyPolygonEureUsdcDeployment,
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

abstract class UniswapV3Executor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: UniswapV3ExecutionDependencies) {
    super();
  }

  protected get dependencies(): UniswapV3ExecutionDependencies {
    return this.injectedDependencies ?? defaultDependencies();
  }

  protected async expectation(state: RampState): Promise<UniswapV3SwapExpectation> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) throw this.createUnrecoverableError("Uniswap fixed swap quote is missing");
    const metadata = getBlockMetadata(quote.metadata, UniswapV3FixedSwapContext);
    const preparation = getBlockState<UniswapV3FixedSwapPreparation>(state.state, UniswapV3FixedSwapContext);
    const signer = state.state.evmEphemeralAddress;
    if (!signer) throw this.createUnrecoverableError("Uniswap fixed swap is missing its EVM ephemeral account");
    return {
      amountInRaw: metadata.inputAmountRaw,
      deadline: preparation.deadline,
      hardMinimumOutputRaw: preparation.hardMinimumOutputRaw,
      signer: signer as `0x${string}`
    };
  }

  protected preparation(state: RampState): UniswapV3FixedSwapPreparation {
    return getBlockState<UniswapV3FixedSwapPreparation>(state.state, UniswapV3FixedSwapContext);
  }

  protected findTransaction(transactions: readonly PresignedTx[], phase: RampPhase, label: string): PresignedTx {
    const transaction = transactions.find(value => value.phase === phase);
    if (!transaction) throw this.createUnrecoverableError(`Uniswap fixed swap is missing its ${label}`);
    return transaction;
  }

  protected async broadcast(
    state: RampState,
    transaction: `0x${string}`,
    dependencies: UniswapV3ExecutionDependencies,
    signal?: AbortSignal
  ): Promise<`0x${string}`> {
    const deterministicHash = keccak256(transaction);
    const existingReceipt = await dependencies.getReceipt(deterministicHash);
    if (existingReceipt) {
      if (existingReceipt.status !== "success") {
        throw new FinancialOperationRejectedError(`Uniswap transaction ${deterministicHash} reverted`);
      }
      return deterministicHash;
    }
    const result = await this.runFinancialOperation(state, {
      attemptClass: "uniswap-presigned-broadcast",
      externalId: value => value.hash,
      perform: async () => {
        throwIfAborted(signal);
        const hash = await dependencies.sendRawTransaction(transaction);
        if (hash.toLowerCase() !== deterministicHash.toLowerCase()) {
          throw new Error(`Uniswap transaction returned hash ${hash}, expected ${deterministicHash}`);
        }
        const receipt = await dependencies.waitForReceipt(hash);
        if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Uniswap transaction ${hash} reverted`);
        return { hash };
      },
      provider: Networks.Polygon,
      reconcile: async () => {
        const receipt = await dependencies.getReceipt(deterministicHash);
        if (!receipt) return null;
        if (receipt.status !== "success") {
          throw new FinancialOperationRejectedError(`Uniswap transaction ${deterministicHash} reverted`);
        }
        return { hash: deterministicHash };
      },
      request: { network: Networks.Polygon, signedTransaction: transaction },
      signal
    });
    return result.hash;
  }
}

export class UniswapApproveExecutor extends UniswapV3Executor {
  public getPhaseName(): RampPhase {
    return "uniswapApprove";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const dependencies = this.dependencies;
    const expectation = await this.expectation(state);
    const signed = this.findTransaction(state.presignedTxs ?? [], this.getPhaseName(), "signed approval");
    const unsigned = this.findTransaction(state.unsignedTxs, this.getPhaseName(), "approval blueprint");
    await validatePresignedEvmTransactionAgainstUnsigned(signed, unsigned);
    const transaction = await validateUniswapApproval(signed, expectation);
    await this.broadcast(state, transaction, dependencies, signal);
    const allowance = await dependencies.getAllowance(expectation.signer);
    if (allowance !== BigInt(expectation.amountInRaw)) {
      throw this.createReconciliationRequiredError(
        `Uniswap approval established allowance ${allowance}, expected ${expectation.amountInRaw}`
      );
    }
    return state;
  }
}

export class UniswapSwapExecutor extends UniswapV3Executor {
  public getPhaseName(): RampPhase {
    return "uniswapSwap";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const dependencies = this.dependencies;
    const expectation = await this.expectation(state);
    const preparation = this.preparation(state);
    const signed = this.findTransaction(state.presignedTxs ?? [], this.getPhaseName(), "signed swap");
    const unsigned = this.findTransaction(state.unsignedTxs, this.getPhaseName(), "swap blueprint");
    await validatePresignedEvmTransactionAgainstUnsigned(signed, unsigned);
    const transaction = await validateUniswapSwap(signed, expectation);
    if (BigInt(expectation.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
      throw this.createRecoverableError("Uniswap fixed swap signature expired before settlement");
    }
    await dependencies.verifyDeployment();
    const [inputBalance, allowance, currentQuote] = await Promise.all([
      dependencies.getBalance(POLYGON_EURE, expectation.signer),
      dependencies.getAllowance(expectation.signer),
      dependencies.quote(BigInt(expectation.amountInRaw))
    ]);
    if (inputBalance < BigInt(expectation.amountInRaw)) {
      throw this.createRecoverableError("Uniswap fixed swap input EURe has not reached the ephemeral account");
    }
    if (allowance !== BigInt(expectation.amountInRaw)) {
      throw this.createReconciliationRequiredError(
        `Uniswap fixed swap allowance ${allowance} does not match ${expectation.amountInRaw}`
      );
    }
    if (currentQuote < BigInt(preparation.softMinimumOutputRaw)) {
      throw this.createRecoverableError("Uniswap fixed swap quote moved below its soft minimum");
    }
    await dependencies.simulateTransaction(transaction);
    await this.broadcast(state, transaction, dependencies, signal);
    const [remainingAllowance, outputBalance] = await Promise.all([
      dependencies.getAllowance(expectation.signer),
      dependencies.getBalance(POLYGON_USDC, expectation.signer)
    ]);
    if (remainingAllowance !== 0n) {
      throw this.createReconciliationRequiredError(`Uniswap fixed swap left unexpected allowance ${remainingAllowance}`);
    }
    if (outputBalance < BigInt(expectation.hardMinimumOutputRaw)) {
      throw this.createReconciliationRequiredError(
        `Uniswap fixed swap produced ${outputBalance} USDC, below ${expectation.hardMinimumOutputRaw}`
      );
    }
    return state;
  }
}
