import { Networks } from "@vortexfi/shared";
import { parseAbi } from "viem";
import { MONERIUM_ISSUE_NETWORKS } from "../monerium-issue/simulation";

export const POLYGON_UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
export const POLYGON_UNISWAP_V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6" as const;
export const POLYGON_UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;
export const POLYGON_EURE_USDC_POOL = "0x368A930B71326e3f640Df36378d931DbE3D03746" as const;
export const POLYGON_EURE = MONERIUM_ISSUE_NETWORKS[Networks.Polygon].eureAddress;
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
export const POLYGON_EURE_USDC_FEE = 500;
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
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)"
]);

export const uniswapV3RouterAbi = parseAbi([
  "function factory() view returns (address)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"
]);
