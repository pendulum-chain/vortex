import { EvmClientManager, Networks, type RampPhase } from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi, parseUnits } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import {
  assertEvmFundingNativeBalance,
  getEvmFundingAccount,
  runSerializedEvmFundingOperation,
  sendEvmFundingTransaction
} from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import {
  BASE_PANCAKE_V3_QUOTER_V2,
  BASE_PANCAKE_V3_ROUTER,
  BASE_PAXG_ADDRESS,
  BASE_PAXG_DECIMALS,
  BASE_PAXG_USDC_POOL_FEE,
  BASE_USDC_ADDRESS,
  BASE_USDC_DECIMALS,
  GOLD_TOKEN
} from "../../core/gold-base";
import { getBlockMetadata } from "../../core/metadata";
import { goldSwapSentOutsideApi, readGoldSwapFill, refuseGoldTopUp } from "../gold-swap/fill";
import { stockSettlementQuoterAbi } from "../stock-settlement/contract";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";
import { classifyStockRouteFailure } from "../uniswap-v3-fixed-swap/route";
import { GoldSettlementContext } from "./simulation";

const NO_PRICE_LIMIT = 0n;
/** The top-up is sent live, so its deadline only bounds how long it may wait in the mempool. */
const TOP_UP_DEADLINE_SECONDS = 10 * 60;

/** PancakeSwap's v3 `SwapRouter` carries the deadline in the struct, unlike the SwapRouter02 a stock top-up uses. */
const goldSettlementRouterAbi = parseAbi([
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)"
]);

interface Receipt {
  status: "success" | "reverted";
}

interface ExecutionState {
  topUpAmountRaw?: string;
  topUpTxHash?: `0x${string}`;
}

interface TopUpOutcome {
  amountRaw: string;
  hash: `0x${string}` | null;
}

interface TopUpPlan {
  amountInMaximum: bigint;
  shortfall: bigint;
}

export interface GoldSettlementDependencies {
  estimateMaxFeePerGas(): Promise<bigint>;
  getNativeBalance(owner: `0x${string}`): Promise<bigint>;
  /** What the buy's own swap paid the ephemeral, or null when that swap has no successful receipt. */
  getSwapFill(swapTransaction: `0x${string}`, ephemeral: `0x${string}`): Promise<bigint | null>;
  getTokenBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  now(): number;
  quoteUsdcIn(paxgOut: bigint): Promise<bigint>;
  send(transaction: { data: `0x${string}`; gas: bigint; to: `0x${string}` }): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(): GoldSettlementDependencies {
  const client = EvmClientManager.getInstance().getClient(Networks.Base);
  return {
    estimateMaxFeePerGas: async () => (await client.estimateFeesPerGas()).maxFeePerGas,
    getNativeBalance: owner => client.getBalance({ address: owner }),
    getSwapFill: (swapTransaction, ephemeral) => readGoldSwapFill(swapTransaction, BASE_PAXG_ADDRESS, ephemeral),
    getTokenBalance: (token, owner) =>
      client.readContract({ abi: erc20Abi, address: token, args: [owner], functionName: "balanceOf" }),
    now: Date.now,
    async quoteUsdcIn(paxgOut) {
      const {
        result: [amountIn]
      } = await client.simulateContract({
        abi: stockSettlementQuoterAbi,
        address: BASE_PANCAKE_V3_QUOTER_V2,
        args: [
          {
            amount: paxgOut,
            fee: BASE_PAXG_USDC_POOL_FEE,
            sqrtPriceLimitX96: NO_PRICE_LIMIT,
            tokenIn: BASE_USDC_ADDRESS,
            tokenOut: BASE_PAXG_ADDRESS
          }
        ],
        functionName: "quoteExactOutputSingle"
      });
      return amountIn;
    },
    send: transaction => sendEvmFundingTransaction(Networks.Base, transaction),
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

/**
 * Delivers the exact PAXG a buy promised. By now the buyer has paid, and whatever the swap produced is on the
 * ephemeral, so nothing here fails the ramp: the funding wallet buys what the swap fell short by through the pinned
 * pool, a top-up above the cap or beyond the swap's own shortfall pauses for an operator, and the phase moves on once
 * the balance suffices. A surplus stays on the ephemeral for the cleanup sweep.
 */
export class GoldSettlementExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: GoldSettlementDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "goldSettlementTopUp";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    try {
      const quote = await QuoteTicket.findByPk(state.quoteId);
      if (!quote) throw new Error("the quote is missing");
      const { amountRaw, maxSubsidyUsd } = getBlockMetadata(quote.metadata, GoldSettlementContext);
      const ephemeral = state.state.evmEphemeralAddress as `0x${string}` | undefined;
      if (!ephemeral) throw new Error("the EVM ephemeral account is missing");

      const funding = getEvmFundingAccount(Networks.Base).address;
      const target = BigInt(amountRaw);
      const dependencies = this.injectedDependencies ?? defaultDependencies();

      let plan: TopUpPlan | null = null;
      const outcome = await runSerializedEvmFundingOperation(
        Networks.Base,
        () =>
          this.runFinancialOperation<TopUpOutcome>(state, {
            attemptClass: "gold-settlement-top-up",
            beforePerform: async () => {
              plan = await this.planTopUp(state, dependencies, { ephemeral, funding, maxSubsidyUsd, target });
            },
            externalId: result => result.hash ?? undefined,
            perform: async () => {
              if (!plan) return { amountRaw: "0", hash: null };
              return this.performTopUp(state, dependencies, plan, ephemeral);
            },
            provider: Networks.Base,
            reconcile: async () => {
              if ((await dependencies.getTokenBalance(BASE_PAXG_ADDRESS, ephemeral)) < target) return null;
              const { topUpAmountRaw, topUpTxHash } = this.getState(state);
              return { amountRaw: topUpAmountRaw ?? "0", hash: topUpTxHash ?? null };
            },
            request: {
              destination: ephemeral,
              network: Networks.Base,
              source: funding,
              targetBalanceRaw: amountRaw,
              token: BASE_PAXG_ADDRESS
            },
            retryFailed: true,
            settleAfterAbort: true,
            signal
          }),
        signal
      );

      if (outcome.hash) {
        const amount = Number(formatUnits(BigInt(outcome.amountRaw), BASE_PAXG_DECIMALS));
        await this.createSubsidy(state, amount, GOLD_TOKEN, funding, outcome.hash);
      }
      const balance = await dependencies.getTokenBalance(BASE_PAXG_ADDRESS, ephemeral);
      if (balance < target) {
        throw this.createRecoverableError(`GoldSettlement: ephemeral holds ${balance}, below the ${target} promised`);
      }
      return state;
    } catch (error) {
      throw classifyStockRouteFailure(error);
    }
  }

  /** Decides inside the journal, so an amount read here is what gets sent. Throwing leaves the operation unclaimed. */
  private async planTopUp(
    state: RampState,
    dependencies: GoldSettlementDependencies,
    {
      ephemeral,
      funding,
      maxSubsidyUsd,
      target
    }: { ephemeral: `0x${string}`; funding: `0x${string}`; maxSubsidyUsd: string; target: bigint }
  ): Promise<TopUpPlan | null> {
    const balance = await dependencies.getTokenBalance(BASE_PAXG_ADDRESS, ephemeral);
    if (balance >= target) return null;
    const shortfall = target - balance;

    // The buyer holds the ephemeral's key: only what the swap itself fell short by is topped up.
    const swapTransaction = this.getPresignedTransaction(state, "uniswapSwap")?.txData;
    const refusal = refuseGoldTopUp(
      shortfall,
      target,
      typeof swapTransaction === "string" ? await dependencies.getSwapFill(swapTransaction as `0x${string}`, ephemeral) : null,
      goldSwapSentOutsideApi(state)
    );
    if (refusal) {
      logger.warn("GOLD_TOP_UP_REFUSED", { rampId: state.id, reason: refusal, shortfallRaw: shortfall.toString() });
      throw this.createReconciliationRequiredError(`GoldSettlement: ${refusal}`);
    }

    const quoted = await dependencies.quoteUsdcIn(shortfall);
    const costUsd = new Big(formatUnits(quoted, BASE_USDC_DECIMALS));
    if (costUsd.gt(maxSubsidyUsd)) {
      logger.warn("GOLD_SETTLEMENT_SUBSIDY_CAP_EXCEEDED", {
        costUsd: costUsd.toFixed(6),
        maxSubsidyUsd,
        rampId: state.id,
        shortfallRaw: shortfall.toString()
      });
      throw this.createReconciliationRequiredError(
        `GoldSettlement: delivering ${shortfall} ${GOLD_TOKEN} costs ${costUsd.toFixed(6)} USD, above the ${maxSubsidyUsd} USD cap`
      );
    }
    const slippageMaximum = (quoted * 101n + 99n) / 100n;
    const subsidyMaximum = parseUnits(new Big(maxSubsidyUsd).toFixed(BASE_USDC_DECIMALS, Big.roundDown), BASE_USDC_DECIMALS);
    const amountInMaximum = slippageMaximum < subsidyMaximum ? slippageMaximum : subsidyMaximum;
    const available = await dependencies.getTokenBalance(BASE_USDC_ADDRESS, funding);
    if (available < amountInMaximum) {
      logger.error("EVM_FUNDING_TOKEN_BALANCE_LOW", {
        availableRaw: available.toString(),
        network: Networks.Base,
        phase: this.getPhaseName(),
        rampId: state.id,
        requiredRaw: amountInMaximum.toString(),
        token: BASE_USDC_ADDRESS
      });
      throw this.createRecoverableError(`GoldSettlement: funding wallet holds ${available}, below ${amountInMaximum} USDC`);
    }
    const [nativeBalance, maxFeePerGas] = await Promise.all([
      dependencies.getNativeBalance(funding),
      dependencies.estimateMaxFeePerGas()
    ]);
    assertEvmFundingNativeBalance(nativeBalance, (UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT) * maxFeePerGas, {
      network: Networks.Base,
      phase: this.getPhaseName(),
      rampId: state.id
    });
    return { amountInMaximum, shortfall };
  }

  private async performTopUp(
    state: RampState,
    dependencies: GoldSettlementDependencies,
    { amountInMaximum, shortfall }: TopUpPlan,
    ephemeral: `0x${string}`
  ): Promise<TopUpOutcome> {
    const confirm = async (hash: `0x${string}`): Promise<void> => {
      const receipt = await dependencies.waitForReceipt(hash);
      if (receipt.status !== "success") {
        throw new FinancialOperationRejectedError(`GoldSettlement transaction ${hash} reverted`);
      }
    };

    await confirm(
      await dependencies.send({
        data: encodeFunctionData({
          abi: erc20Abi,
          args: [BASE_PANCAKE_V3_ROUTER, amountInMaximum],
          functionName: "approve"
        }),
        gas: UNISWAP_APPROVE_GAS_LIMIT,
        to: BASE_USDC_ADDRESS
      })
    );
    const hash = await dependencies.send({
      data: encodeFunctionData({
        abi: goldSettlementRouterAbi,
        args: [
          {
            amountInMaximum,
            amountOut: shortfall,
            deadline: BigInt(Math.floor(dependencies.now() / 1000) + TOP_UP_DEADLINE_SECONDS),
            fee: BASE_PAXG_USDC_POOL_FEE,
            recipient: ephemeral,
            sqrtPriceLimitX96: NO_PRICE_LIMIT,
            tokenIn: BASE_USDC_ADDRESS,
            tokenOut: BASE_PAXG_ADDRESS
          }
        ],
        functionName: "exactOutputSingle"
      }),
      gas: UNISWAP_SWAP_GAS_LIMIT,
      to: BASE_PANCAKE_V3_ROUTER
    });
    await this.updateState(state, { topUpAmountRaw: shortfall.toString(), topUpTxHash: hash });
    await confirm(hash);
    return { amountRaw: shortfall.toString(), hash };
  }

  private getState(state: RampState): ExecutionState {
    return (state.state.blockState?.[GoldSettlementContext.key] ?? {}) as ExecutionState;
  }

  private async updateState(state: RampState, patch: ExecutionState): Promise<void> {
    await state.update({
      state: {
        ...state.state,
        blockState: { ...state.state.blockState, [GoldSettlementContext.key]: { ...this.getState(state), ...patch } }
      }
    });
  }
}
