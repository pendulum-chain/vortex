import { Networks, RampDirection } from "@vortexfi/shared";
import { isAddress, isAddressEqual } from "viem";
import { APIError } from "../../../../../errors/api-error";
import {
  PhaseError,
  ReconciliationRequiredPhaseError,
  RecoverablePhaseError,
  requiresManualReconciliation
} from "../../../../../errors/phase-error";
import type { StateMetadata } from "../../../meta-state-types";
import { defineContext, getBlockMetadata, getBlockState, isRecord } from "../../core/metadata";
import {
  isStockSymbol,
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_QUOTER_V2,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  type StockSymbol
} from "../../core/robinhood-stocks";
import { POLYGON_EURE_USDC_TARGET, POLYGON_USDC, stockSwapPath, stockSwapTokens, type UniswapSwapTarget } from "./contract";
import {
  quotePolygonEureToUsdc,
  quoteStockSwap,
  UniswapV3FixedSwapContext,
  verifyPolygonEureUsdcDeployment,
  verifyStockSwapDeployment
} from "./simulation";
import type { UniswapV3FixedSwapPreparation } from "./transactions";

export const STOCK_ROUTE_CONTEXT_KEY = "stockRoute";
const StockRouteStateContext = defineContext<unknown>()(STOCK_ROUTE_CONTEXT_KEY);

/** `blocks.stockRoute.swap` in the quote metadata. */
export interface StockRouteSwapMetadata {
  costUsd: string;
  hardMinimumOutputRaw: string;
  inputAmountRaw: string;
  inputToken: string;
  network: typeof Networks.Robinhood;
  outputAmountRaw: string;
  outputToken: string;
  path: string;
  pools: string[];
  quoter: string;
  router: string;
  routerKind: "swapRouter02";
  softMinimumOutputRaw: string;
}

/** The part of the StockRoute preparation state the swap needs. */
export interface StockRouteSwapState {
  relayDepositAddress?: string;
  swapDeadline: string;
}

export interface UniswapRoute extends UniswapSwapTarget {
  amountInRaw: string;
  deadline: string;
  hardMinimumOutputRaw: string;
  inputSymbol: string;
  outputSymbol: string;
  outputToken: `0x${string}`;
  quote(amountIn: bigint): Promise<bigint>;
  /** The swap's output goes here: the signer, except on a stock sell, where it is the Relay deposit address. */
  recipient: `0x${string}`;
  signer: `0x${string}`;
  softMinimumOutputRaw: string;
  /** Set on stock routes: failures must never fail the ramp, and issuer pauses hold it. */
  stock?: StockSymbol;
  verifyDeployment(): Promise<void>;
}

/**
 * Stock route funds sit on the ephemeral or with the bridge, so nothing on the route may fail the ramp. Journal
 * verdicts and mined reverts need an operator; anything else is transient, and the journal makes re-entry safe.
 */
export function classifyStockRouteFailure(error: unknown): unknown {
  if (error instanceof PhaseError || requiresManualReconciliation(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof APIError ? new ReconciliationRequiredPhaseError(message) : new RecoverablePhaseError(message);
}

function samePin(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Metadata is only trusted as far as it agrees with the allowlist pins. */
function resolveStockRoute(block: Record<string, unknown>, state: StateMetadata, signer: `0x${string}`): UniswapRoute {
  const { direction, token } = block;
  const swap = block.swap as StockRouteSwapMetadata;
  if (!isStockSymbol(token) || (direction !== RampDirection.BUY && direction !== RampDirection.SELL)) {
    throw new Error(`token ${String(token)} or direction ${String(direction)} is not on the allowlist`);
  }
  const { inputToken, outputToken } = stockSwapTokens(token, direction);
  const path = stockSwapPath(token, direction);
  if (
    swap.network !== Networks.Robinhood ||
    swap.routerKind !== "swapRouter02" ||
    !samePin(swap.router, ROBINHOOD_UNISWAP_SWAP_ROUTER_02) ||
    !samePin(swap.quoter, ROBINHOOD_UNISWAP_QUOTER_V2) ||
    !samePin(swap.inputToken, inputToken) ||
    !samePin(swap.outputToken, outputToken) ||
    !samePin(swap.path, path) ||
    swap.pools.length !== 1 ||
    !samePin(swap.pools[0], ROBINHOOD_STOCKS[token].uniswapPool)
  ) {
    throw new Error(`swap does not match the ${token} pins`);
  }
  const hardMinimum = BigInt(swap.hardMinimumOutputRaw);
  if (BigInt(swap.inputAmountRaw) <= 0n || hardMinimum <= 0n || BigInt(swap.softMinimumOutputRaw) < hardMinimum) {
    throw new Error("swap amounts or minimums are invalid");
  }

  const { relayDepositAddress, swapDeadline } = getBlockState<StockRouteSwapState>(state, StockRouteStateContext);
  let recipient = signer;
  if (direction === RampDirection.SELL) {
    if (
      !relayDepositAddress ||
      !isAddress(relayDepositAddress, { strict: false }) ||
      isAddressEqual(relayDepositAddress, signer)
    ) {
      throw new Error(`relay deposit address ${relayDepositAddress} is unusable`);
    }
    recipient = relayDepositAddress;
  }
  if (BigInt(swapDeadline) <= 0n) {
    throw new Error("swap deadline is invalid");
  }

  const isBuy = direction === RampDirection.BUY;
  return {
    amountInRaw: swap.inputAmountRaw,
    deadline: swapDeadline,
    hardMinimumOutputRaw: swap.hardMinimumOutputRaw,
    inputSymbol: isBuy ? "USDG" : token,
    inputToken,
    kind: "swapRouter02",
    label: `Robinhood ${token}/USDG`,
    network: Networks.Robinhood,
    outputSymbol: isBuy ? token : "USDG",
    outputToken,
    path,
    quote: amountIn => quoteStockSwap(path, amountIn),
    recipient,
    router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
    signer,
    softMinimumOutputRaw: swap.softMinimumOutputRaw,
    stock: token,
    verifyDeployment: () => verifyStockSwapDeployment(token)
  };
}

/** Reads `blocks.stockRoute.swap` when present, otherwise the fixed Polygon block. */
export function resolveUniswapRoute(quoteMetadata: unknown, state: StateMetadata, signer: `0x${string}`): UniswapRoute {
  const stockBlock = (quoteMetadata as { blocks?: Record<string, unknown> } | null)?.blocks?.[STOCK_ROUTE_CONTEXT_KEY];
  if (isRecord(stockBlock)) {
    try {
      return resolveStockRoute(stockBlock, state, signer);
    } catch (error) {
      // The stock or USDG is already on the ephemeral, so a route that cannot be trusted pauses instead of failing the ramp.
      throw new ReconciliationRequiredPhaseError(
        `Uniswap stock route cannot be resolved: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const metadata = getBlockMetadata(quoteMetadata, UniswapV3FixedSwapContext);
  const preparation = getBlockState<UniswapV3FixedSwapPreparation>(state, UniswapV3FixedSwapContext);
  return {
    ...POLYGON_EURE_USDC_TARGET,
    amountInRaw: metadata.inputAmountRaw,
    deadline: preparation.deadline,
    hardMinimumOutputRaw: preparation.hardMinimumOutputRaw,
    inputSymbol: "EURe",
    outputSymbol: "USDC",
    outputToken: POLYGON_USDC,
    quote: quotePolygonEureToUsdc,
    recipient: signer,
    signer,
    softMinimumOutputRaw: preparation.softMinimumOutputRaw,
    verifyDeployment: verifyPolygonEureUsdcDeployment
  };
}
