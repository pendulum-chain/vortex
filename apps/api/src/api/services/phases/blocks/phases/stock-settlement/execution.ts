import { EvmClientManager, Networks, type RampPhase } from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, formatUnits } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { EVM_ERC20_TRANSFER_GAS_LIMIT } from "../../core/evm-destination-gas";
import {
  assertEvmFundingNativeBalance,
  getEvmFundingAccount,
  runSerializedEvmFundingOperation,
  sendEvmFundingTransaction
} from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata } from "../../core/metadata";
import {
  isStockQuoteUnavailableError,
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_QUOTER_V2,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  ROBINHOOD_USDG_ADDRESS,
  readStockReferencePrice,
  STOCK_TOKEN_DECIMALS,
  type StockSymbol
} from "../../core/robinhood-stocks";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";
import { classifyStockRouteFailure } from "../uniswap-v3-fixed-swap/route";
import { stockSettlementQuoterAbi, stockSettlementRouterAbi } from "./contract";
import { StockSettlementContext } from "./simulation";

const USDG_DECIMALS = 6;
const NO_PRICE_LIMIT = 0n;

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

/** With a maximum, the funding wallet buys the shortfall with USDG. Without one, it transfers it from its own stock. */
interface TopUpPlan {
  amountInMaximum?: bigint;
  shortfall: bigint;
}

export interface StockSettlementDependencies {
  estimateMaxFeePerGas(): Promise<bigint>;
  getNativeBalance(owner: `0x${string}`): Promise<bigint>;
  getTokenBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  quoteUsdgIn(symbol: StockSymbol, stockOut: bigint): Promise<bigint>;
  readStockPriceUsd(symbol: StockSymbol): Promise<Big>;
  send(transaction: { data: `0x${string}`; gas: bigint; to: `0x${string}` }): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(): StockSettlementDependencies {
  const client = EvmClientManager.getInstance().getClient(Networks.Robinhood);
  return {
    estimateMaxFeePerGas: async () => (await client.estimateFeesPerGas()).maxFeePerGas,
    getNativeBalance: owner => client.getBalance({ address: owner }),
    getTokenBalance: (token, owner) =>
      client.readContract({ abi: erc20Abi, address: token, args: [owner], functionName: "balanceOf" }),
    async quoteUsdgIn(symbol, stockOut) {
      const { address, uniswapFee } = ROBINHOOD_STOCKS[symbol];
      const {
        result: [amountIn]
      } = await client.simulateContract({
        abi: stockSettlementQuoterAbi,
        address: ROBINHOOD_UNISWAP_QUOTER_V2,
        args: [
          {
            amount: stockOut,
            fee: uniswapFee,
            sqrtPriceLimitX96: NO_PRICE_LIMIT,
            tokenIn: ROBINHOOD_USDG_ADDRESS,
            tokenOut: address
          }
        ],
        functionName: "quoteExactOutputSingle"
      });
      return amountIn;
    },
    readStockPriceUsd: async symbol => (await readStockReferencePrice(symbol)).priceUsd,
    send: transaction => sendEvmFundingTransaction(Networks.Robinhood, transaction),
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

/**
 * Delivers the exact amount a buy promised. By now the buyer has paid, and whatever the swap produced is safe on the
 * ephemeral, so nothing here fails the ramp: a top-up above the cap pauses for an operator, and the phase moves on once
 * the balance suffices. A surplus stays on the ephemeral for the cleanup sweep.
 */
export class StockSettlementExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: StockSettlementDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "stockSettlementTopUp";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    try {
      const quote = await QuoteTicket.findByPk(state.quoteId);
      if (!quote) throw new Error("the quote is missing");
      const { amountRaw, maxSubsidyUsd, token } = getBlockMetadata(quote.metadata, StockSettlementContext);
      const ephemeral = state.state.evmEphemeralAddress as `0x${string}` | undefined;
      if (!ephemeral) throw new Error("the EVM ephemeral account is missing");

      const stock = ROBINHOOD_STOCKS[token].address;
      const funding = getEvmFundingAccount(Networks.Robinhood).address;
      const target = BigInt(amountRaw);
      const dependencies = this.injectedDependencies ?? defaultDependencies();

      let plan: TopUpPlan | null = null;
      const outcome = await runSerializedEvmFundingOperation(
        Networks.Robinhood,
        () =>
          this.runFinancialOperation<TopUpOutcome>(state, {
            attemptClass: "stock-settlement-top-up",
            beforePerform: async () => {
              plan = await this.planTopUp(state, dependencies, { ephemeral, funding, maxSubsidyUsd, stock, target, token });
            },
            externalId: result => result.hash ?? undefined,
            perform: async () => {
              if (!plan) return { amountRaw: "0", hash: null };
              return this.performTopUp(state, dependencies, plan, { ephemeral, stock, token });
            },
            provider: Networks.Robinhood,
            reconcile: async () => {
              if ((await dependencies.getTokenBalance(stock, ephemeral)) < target) return null;
              const { topUpAmountRaw, topUpTxHash } = this.getState(state);
              return { amountRaw: topUpAmountRaw ?? "0", hash: topUpTxHash ?? null };
            },
            request: {
              destination: ephemeral,
              network: Networks.Robinhood,
              source: funding,
              targetBalanceRaw: amountRaw,
              token: stock
            },
            retryFailed: true,
            settleAfterAbort: true,
            signal
          }),
        signal
      );

      if (outcome.hash) {
        const amount = Number(formatUnits(BigInt(outcome.amountRaw), STOCK_TOKEN_DECIMALS));
        await this.createSubsidy(state, amount, token, funding, outcome.hash);
      }
      const balance = await dependencies.getTokenBalance(stock, ephemeral);
      if (balance < target) {
        throw this.createRecoverableError(`StockSettlement: ephemeral holds ${balance}, below the ${target} promised`);
      }
      return state;
    } catch (error) {
      throw isStockQuoteUnavailableError(error) ? this.createRecoverableError(error.message) : classifyStockRouteFailure(error);
    }
  }

  /** Decides inside the journal, so an amount read here is what gets sent. Throwing leaves the operation unclaimed. */
  private async planTopUp(
    state: RampState,
    dependencies: StockSettlementDependencies,
    {
      ephemeral,
      funding,
      maxSubsidyUsd,
      stock,
      target,
      token
    }: {
      ephemeral: `0x${string}`;
      funding: `0x${string}`;
      maxSubsidyUsd: string;
      stock: `0x${string}`;
      target: bigint;
      token: StockSymbol;
    }
  ): Promise<TopUpPlan | null> {
    const balance = await dependencies.getTokenBalance(stock, ephemeral);
    if (balance >= target) return null;
    const shortfall = target - balance;

    const assertWithinCap = (costUsd: Big): void => {
      if (costUsd.lte(maxSubsidyUsd)) return;
      logger.warn("STOCK_SETTLEMENT_SUBSIDY_CAP_EXCEEDED", {
        costUsd: costUsd.toFixed(6),
        maxSubsidyUsd,
        rampId: state.id,
        shortfallRaw: shortfall.toString(),
        token
      });
      throw this.createReconciliationRequiredError(
        `StockSettlement: delivering ${shortfall} ${token} costs ${costUsd.toFixed(2)} USD, above the ${maxSubsidyUsd} USD cap`
      );
    };

    if ((await dependencies.getTokenBalance(stock, funding)) >= shortfall) {
      const stockOut = new Big(formatUnits(shortfall, STOCK_TOKEN_DECIMALS));
      assertWithinCap(stockOut.mul(await dependencies.readStockPriceUsd(token)));
      await this.assertFundingCanPayGas(state, dependencies, funding, EVM_ERC20_TRANSFER_GAS_LIMIT);
      return { shortfall };
    }

    const quoted = await dependencies.quoteUsdgIn(token, shortfall);
    assertWithinCap(new Big(formatUnits(quoted, USDG_DECIMALS)));
    const amountInMaximum = (quoted * 101n + 99n) / 100n;
    const available = await dependencies.getTokenBalance(ROBINHOOD_USDG_ADDRESS, funding);
    if (available < amountInMaximum) {
      logger.error("EVM_FUNDING_TOKEN_BALANCE_LOW", {
        availableRaw: available.toString(),
        network: Networks.Robinhood,
        phase: this.getPhaseName(),
        rampId: state.id,
        requiredRaw: amountInMaximum.toString(),
        token: ROBINHOOD_USDG_ADDRESS
      });
      throw this.createRecoverableError(
        `StockSettlement: funding wallet holds neither ${shortfall} ${token} nor ${amountInMaximum} USDG`
      );
    }
    await this.assertFundingCanPayGas(state, dependencies, funding, UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT);
    return { amountInMaximum, shortfall };
  }

  private async assertFundingCanPayGas(
    state: RampState,
    dependencies: StockSettlementDependencies,
    funding: `0x${string}`,
    gas: bigint
  ): Promise<void> {
    const [available, maxFeePerGas] = await Promise.all([
      dependencies.getNativeBalance(funding),
      dependencies.estimateMaxFeePerGas()
    ]);
    assertEvmFundingNativeBalance(available, gas * maxFeePerGas, {
      network: Networks.Robinhood,
      phase: this.getPhaseName(),
      rampId: state.id
    });
  }

  private async performTopUp(
    state: RampState,
    dependencies: StockSettlementDependencies,
    { amountInMaximum, shortfall }: TopUpPlan,
    { ephemeral, stock, token }: { ephemeral: `0x${string}`; stock: `0x${string}`; token: StockSymbol }
  ): Promise<TopUpOutcome> {
    const confirm = async (hash: `0x${string}`): Promise<void> => {
      const receipt = await dependencies.waitForReceipt(hash);
      if (receipt.status !== "success")
        throw new FinancialOperationRejectedError(`StockSettlement transaction ${hash} reverted`);
    };

    let transaction: { data: `0x${string}`; gas: bigint; to: `0x${string}` };
    if (amountInMaximum === undefined) {
      transaction = {
        data: encodeFunctionData({ abi: erc20Abi, args: [ephemeral, shortfall], functionName: "transfer" }),
        gas: EVM_ERC20_TRANSFER_GAS_LIMIT,
        to: stock
      };
    } else {
      await confirm(
        await dependencies.send({
          data: encodeFunctionData({
            abi: erc20Abi,
            args: [ROBINHOOD_UNISWAP_SWAP_ROUTER_02, amountInMaximum],
            functionName: "approve"
          }),
          gas: UNISWAP_APPROVE_GAS_LIMIT,
          to: ROBINHOOD_USDG_ADDRESS
        })
      );
      transaction = {
        data: encodeFunctionData({
          abi: stockSettlementRouterAbi,
          args: [
            {
              amountInMaximum,
              amountOut: shortfall,
              fee: ROBINHOOD_STOCKS[token].uniswapFee,
              recipient: ephemeral,
              sqrtPriceLimitX96: NO_PRICE_LIMIT,
              tokenIn: ROBINHOOD_USDG_ADDRESS,
              tokenOut: stock
            }
          ],
          functionName: "exactOutputSingle"
        }),
        gas: UNISWAP_SWAP_GAS_LIMIT,
        to: ROBINHOOD_UNISWAP_SWAP_ROUTER_02
      };
    }

    const hash = await dependencies.send(transaction);
    await this.updateState(state, { topUpAmountRaw: shortfall.toString(), topUpTxHash: hash });
    await confirm(hash);
    return { amountRaw: shortfall.toString(), hash };
  }

  private getState(state: RampState): ExecutionState {
    return (state.state.blockState?.[StockSettlementContext.key] ?? {}) as ExecutionState;
  }

  private async updateState(state: RampState, patch: ExecutionState): Promise<void> {
    await state.update({
      state: {
        ...state.state,
        blockState: { ...state.state.blockState, [StockSettlementContext.key]: { ...this.getState(state), ...patch } }
      }
    });
  }
}
