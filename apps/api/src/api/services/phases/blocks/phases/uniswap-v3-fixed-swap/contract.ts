import { Networks } from "@vortexfi/shared";
import { encodePacked, parseAbi } from "viem";
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
