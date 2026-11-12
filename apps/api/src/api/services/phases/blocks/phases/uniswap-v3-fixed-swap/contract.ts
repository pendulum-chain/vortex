import { Networks, RampDirection } from "@vortexfi/shared";
import { encodeFunctionData, encodePacked, parseAbi } from "viem";
import { ROBINHOOD_STOCKS, ROBINHOOD_USDG_ADDRESS, type StockSymbol } from "../../core/robinhood-stocks";
import { MONERIUM_ISSUE_NETWORKS } from "../monerium-issue/simulation";

export const POLYGON_UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
export const POLYGON_UNISWAP_V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6" as const;
export const POLYGON_UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;
export const POLYGON_EURE = MONERIUM_ISSUE_NETWORKS[Networks.Polygon].eureAddress;
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
export const POLYGON_USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

/**
 * EURe -> USDC.e (0.30%) -> USDC (0.01%). The direct EURe/USDC pool holds ~1k USDC in range and
 * dies near 1,000 EUR; the bridged-USDC pool holds ~20k and USDC.e/USDC is deep, so this path
 * quotes 5,000 EUR at ~0.3% impact (2026-09-17). Ordered from input to output.
 */
export const POLYGON_EURE_USDC_ROUTE = [
  { fee: 3000, pool: "0x7d4324293304797cB662C6EA1B904B6AF2b485F5", tokenIn: POLYGON_EURE, tokenOut: POLYGON_USDCE },
  { fee: 100, pool: "0xD36ec33c8bed5a9F7B6630855f1533455b98a418", tokenIn: POLYGON_USDCE, tokenOut: POLYGON_USDC }
] as const;
/** Uniswap v3 packed path for `exactInput` / `quoteExactInput`: token, fee, token, fee, token. */
export const POLYGON_EURE_USDC_PATH = encodePacked(
  ["address", "uint24", "address", "uint24", "address"],
  [POLYGON_EURE, POLYGON_EURE_USDC_ROUTE[0].fee, POLYGON_USDCE, POLYGON_EURE_USDC_ROUTE[1].fee, POLYGON_USDC]
);
export const UNISWAP_APPROVE_GAS_LIMIT = 100_000n;
export const UNISWAP_SWAP_GAS_LIMIT = 500_000n;
/**
 * A stock swap crosses more initialized ticks than the Polygon route: about 840k gas for 21,800 USD of QQQ at the
 * corridor limit on 2026-11-08. A quote whose QuoterV2 estimate exceeds the second bound is refused, which leaves room
 * for the router's own ~100-175k and for ticks that move before the swap.
 */
export const STOCK_SWAP_GAS_LIMIT = 1_200_000n;
export const STOCK_SWAP_MAX_QUOTED_GAS = 900_000n;

export const uniswapV3PoolAbi = parseAbi([
  "function factory() view returns (address)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);

export const uniswapV3FactoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)"
]);

export const uniswapV3QuoterAbi = parseAbi([
  "function factory() view returns (address)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut)"
]);

export const uniswapV3RouterAbi = parseAbi([
  "function factory() view returns (address)",
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256 amountOut)"
]);

/** QuoterV2 returns four values where the original quoter returned one, under the same selector. */
export const uniswapV3QuoterV2Abi = parseAbi([
  "function factory() view returns (address)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)"
]);

/** SwapRouter02's `exactInput` struct has no deadline: only the `multicall` wrapper carries one. */
export const swapRouter02Abi = parseAbi([
  "function factory() view returns (address)",
  "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)"
]);

export type UniswapRouterKind = "v1" | "swapRouter02";

export function encodeUniswapSwap(
  kind: UniswapRouterKind,
  {
    deadline,
    ...params
  }: {
    amountIn: bigint;
    amountOutMinimum: bigint;
    deadline: bigint;
    path: `0x${string}`;
    recipient: `0x${string}`;
  }
): `0x${string}` {
  if (kind === "v1") {
    return encodeFunctionData({ abi: uniswapV3RouterAbi, args: [{ ...params, deadline }], functionName: "exactInput" });
  }
  return encodeFunctionData({
    abi: swapRouter02Abi,
    args: [deadline, [encodeFunctionData({ abi: swapRouter02Abi, args: [params], functionName: "exactInput" })]],
    functionName: "multicall"
  });
}

/** Single hop between a stock and USDG through the stock's pinned pool, ordered from input to output. */
export function stockSwapTokens(
  symbol: StockSymbol,
  direction: RampDirection
): { inputToken: `0x${string}`; outputToken: `0x${string}` } {
  const stock = ROBINHOOD_STOCKS[symbol].address;
  return direction === RampDirection.BUY
    ? { inputToken: ROBINHOOD_USDG_ADDRESS, outputToken: stock }
    : { inputToken: stock, outputToken: ROBINHOOD_USDG_ADDRESS };
}

export function stockSwapPath(symbol: StockSymbol, direction: RampDirection): `0x${string}` {
  const { inputToken, outputToken } = stockSwapTokens(symbol, direction);
  return encodePacked(["address", "uint24", "address"], [inputToken, ROBINHOOD_STOCKS[symbol].uniswapFee, outputToken]);
}

/** What a presigned approval and swap are checked against. */
export interface UniswapSwapTarget {
  inputToken: `0x${string}`;
  kind: UniswapRouterKind;
  label: string;
  network: Networks.Polygon | Networks.Robinhood;
  path: `0x${string}`;
  router: `0x${string}`;
}

export const POLYGON_EURE_USDC_TARGET: UniswapSwapTarget = {
  inputToken: POLYGON_EURE,
  kind: "v1",
  label: "Polygon EURe/USDC",
  network: Networks.Polygon,
  path: POLYGON_EURE_USDC_PATH,
  router: POLYGON_UNISWAP_V3_ROUTER
};
