import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  EvmToken,
  getRelayQuote,
  Networks,
  RampDirection,
  RELAY_BASE_CHAIN_ID,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_PLACEHOLDER_ADDRESS,
  RELAY_ROBINHOOD_CHAIN_ID,
  RELAY_ROBINHOOD_USDG_ADDRESS
} from "@vortexfi/shared";
import Big from "big.js";
import { evmIO } from "../../core/io";
import { defineContext } from "../../core/metadata";
import {
  assertStockPriceWithinGuard,
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_QUOTER_V2,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  readStockReferencePrice,
  STOCK_TOKEN_DECIMALS,
  type StockSymbol
} from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { stockSwapPath, stockSwapTokens } from "../uniswap-v3-fixed-swap/contract";
import { STOCK_ROUTE_CONTEXT_KEY, type StockRouteSwapMetadata, type StockRouteSwapState } from "../uniswap-v3-fixed-swap/route";
import { quoteStockSwap, verifyStockSwapDeployment } from "../uniswap-v3-fixed-swap/simulation";

const STABLECOIN_DECIMALS = 6;
/** Taken off the Relay output a buy swaps, so the order placed at registration still costs at most the quoted input. */
const RELAY_FEE_DRIFT_MARGIN = 0.0002;
export const RELAY_SELL_SLIPPAGE_TOLERANCE_BPS = "50";

export interface StockRouteMetadata {
  bridge: {
    costUsd: string;
    fromNetwork: Networks.Base | Networks.Robinhood;
    inputAmountRaw: string;
    inputTokenAddress: string;
    outputAmountRaw: string;
    outputTokenAddress: string;
    toNetwork: Networks.Base | Networks.Robinhood;
  };
  direction: RampDirection;
  reference: { deviationBps: number; priceUsd: string; updatedAt: string };
  swap: StockRouteSwapMetadata;
  token: StockSymbol;
}

export interface StockRouteState extends StockRouteSwapState {
  /** X': the USDC a buy's order takes, at most the quoted input. */
  relayInputAmountRaw?: string;
  /** The USDC a sell's order guarantees. */
  relayMinimumOutputRaw?: string;
  relayRequestId: string;
}

export const StockRouteContext = defineContext<StockRouteMetadata>()(STOCK_ROUTE_CONTEXT_KEY);

export interface StockRouteSimulationDependencies {
  quoteSwap?: typeof quoteStockSwap;
  readReference?: typeof readStockReferencePrice;
  verifyDeployment?: typeof verifyStockSwapDeployment;
}

const toDecimal = (raw: string | bigint, decimals: number) => new Big(raw.toString()).div(new Big(10).pow(decimals));

function assertInput(input: PhaseIO, token: string, chain: Networks): void {
  if (input.chain !== chain || input.token !== token || BigInt(input.amountRaw) <= 0n) {
    throw new Error(`StockRoute requires a positive ${token} amount on ${chain}`);
  }
}

/** `costUsd` is measured against the reference price, so a fill better than the reference is negative. */
function swapMetadata(
  token: StockSymbol,
  direction: RampDirection,
  inputAmountRaw: string,
  outputAmountRaw: string,
  costUsd: Big
): StockRouteSwapMetadata {
  const minimum = (margin: number) => new Big(outputAmountRaw).mul(new Big(1).minus(margin)).toFixed(0, 0);
  return {
    costUsd: costUsd.toFixed(6),
    hardMinimumOutputRaw: minimum(AMM_MINIMUM_OUTPUT_HARD_MARGIN),
    inputAmountRaw,
    ...stockSwapTokens(token, direction),
    network: Networks.Robinhood,
    outputAmountRaw,
    path: stockSwapPath(token, direction),
    pools: [ROBINHOOD_STOCKS[token].uniswapPool],
    quoter: ROBINHOOD_UNISWAP_QUOTER_V2,
    router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
    routerKind: "swapRouter02",
    softMinimumOutputRaw: minimum(AMM_MINIMUM_OUTPUT_SOFT_MARGIN)
  };
}

export async function simulateStockRouteBuy<Token extends StockSymbol>(
  token: Token,
  input: PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  ctx: PhaseCtx,
  dependencies: StockRouteSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<Token, typeof Networks.Robinhood>, StockRouteMetadata>> {
  assertInput(input, EvmToken.USDC, Networks.Base);
  await (dependencies.verifyDeployment ?? verifyStockSwapDeployment)(token);

  const relayQuote = await getRelayQuote({
    amount: input.amountRaw,
    destinationChainId: RELAY_ROBINHOOD_CHAIN_ID,
    destinationCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
    originChainId: RELAY_BASE_CHAIN_ID,
    originCurrency: RELAY_BASE_USDC_ADDRESS,
    tradeType: "EXACT_INPUT",
    user: RELAY_PLACEHOLDER_ADDRESS
  });
  const usdgRaw = new Big(relayQuote.details.currencyOut.amount).mul(new Big(1).minus(RELAY_FEE_DRIFT_MARGIN)).toFixed(0, 0);
  if (BigInt(usdgRaw) <= 0n) throw new Error(`StockRoute: Relay leaves no USDG from ${input.amountRaw} USDC`);

  const stockRaw = await (dependencies.quoteSwap ?? quoteStockSwap)(stockSwapPath(token, RampDirection.BUY), BigInt(usdgRaw));
  if (stockRaw <= 0n) throw new Error(`StockRoute: Uniswap returned no ${token} for ${usdgRaw} USDG`);

  const usdg = toDecimal(usdgRaw, STABLECOIN_DECIMALS);
  const stock = toDecimal(stockRaw, STOCK_TOKEN_DECIMALS);
  const reference = await (dependencies.readReference ?? readStockReferencePrice)(token);
  const { deviationBps } = assertStockPriceWithinGuard({
    direction: RampDirection.BUY,
    executionPriceUsd: usdg.div(stock),
    now: ctx.now,
    reference
  });
  ctx.addNote(`StockRoute: ${input.amount.toFixed()} USDC -> ${usdg.toFixed()} USDG -> ${stock.toFixed()} ${token}`);

  return {
    metadata: {
      bridge: {
        costUsd: input.amount.minus(usdg).toFixed(6),
        fromNetwork: Networks.Base,
        inputAmountRaw: input.amountRaw,
        inputTokenAddress: RELAY_BASE_USDC_ADDRESS,
        outputAmountRaw: usdgRaw,
        outputTokenAddress: RELAY_ROBINHOOD_USDG_ADDRESS,
        toNetwork: Networks.Robinhood
      },
      direction: RampDirection.BUY,
      reference: { deviationBps, priceUsd: reference.priceUsd.toString(), updatedAt: reference.updatedAt.toISOString() },
      swap: swapMetadata(token, RampDirection.BUY, usdgRaw, stockRaw.toString(), usdg.minus(stock.mul(reference.priceUsd))),
      token
    },
    output: { ...evmIO(token, Networks.Robinhood, stock, stockRaw.toString()), requestInputAmountUsd: usdg }
  };
}

export async function simulateStockRouteSell<Token extends StockSymbol>(
  token: Token,
  input: PhaseIO<Token, typeof Networks.Robinhood>,
  ctx: PhaseCtx,
  dependencies: StockRouteSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>, StockRouteMetadata>> {
  assertInput(input, token, Networks.Robinhood);
  await (dependencies.verifyDeployment ?? verifyStockSwapDeployment)(token);

  const usdgRaw = await (dependencies.quoteSwap ?? quoteStockSwap)(
    stockSwapPath(token, RampDirection.SELL),
    BigInt(input.amountRaw)
  );
  if (usdgRaw <= 0n) throw new Error(`StockRoute: Uniswap returned no USDG for ${input.amountRaw} ${token}`);

  const usdg = toDecimal(usdgRaw, STABLECOIN_DECIMALS);
  const reference = await (dependencies.readReference ?? readStockReferencePrice)(token);
  const { deviationBps } = assertStockPriceWithinGuard({
    direction: RampDirection.SELL,
    executionPriceUsd: usdg.div(input.amount),
    now: ctx.now,
    reference
  });

  const relayQuote = await getRelayQuote({
    amount: usdgRaw.toString(),
    destinationChainId: RELAY_BASE_CHAIN_ID,
    destinationCurrency: RELAY_BASE_USDC_ADDRESS,
    originChainId: RELAY_ROBINHOOD_CHAIN_ID,
    originCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
    refundTo: RELAY_PLACEHOLDER_ADDRESS,
    slippageTolerance: RELAY_SELL_SLIPPAGE_TOLERANCE_BPS,
    strict: true,
    tradeType: "EXACT_INPUT",
    useDepositAddress: true,
    user: RELAY_PLACEHOLDER_ADDRESS
  });
  const usdcRaw = relayQuote.details.currencyOut.amount;
  if (BigInt(usdcRaw) <= 0n) throw new Error(`StockRoute: Relay leaves no USDC from ${usdgRaw} USDG`);
  const usdc = toDecimal(usdcRaw, STABLECOIN_DECIMALS);
  ctx.addNote(`StockRoute: ${input.amount.toFixed()} ${token} -> ${usdg.toFixed()} USDG -> ${usdc.toFixed()} USDC`);

  return {
    metadata: {
      bridge: {
        costUsd: usdg.minus(usdc).toFixed(6),
        fromNetwork: Networks.Robinhood,
        inputAmountRaw: usdgRaw.toString(),
        inputTokenAddress: RELAY_ROBINHOOD_USDG_ADDRESS,
        outputAmountRaw: usdcRaw,
        outputTokenAddress: RELAY_BASE_USDC_ADDRESS,
        toNetwork: Networks.Base
      },
      direction: RampDirection.SELL,
      reference: { deviationBps, priceUsd: reference.priceUsd.toString(), updatedAt: reference.updatedAt.toISOString() },
      swap: swapMetadata(
        token,
        RampDirection.SELL,
        input.amountRaw,
        usdgRaw.toString(),
        input.amount.mul(reference.priceUsd).minus(usdg)
      ),
      token
    },
    output: { ...evmIO(EvmToken.USDC, Networks.Base, usdc, usdcRaw), requestInputAmountUsd: usdc }
  };
}
