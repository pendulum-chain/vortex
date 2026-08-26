import { EvmClientManager, EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { getAddress } from "viem";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { MONERIUM_EURE } from "../monerium-issue/simulation";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_FEE,
  POLYGON_EURE_USDC_POOL,
  POLYGON_UNISWAP_V3_FACTORY,
  POLYGON_UNISWAP_V3_QUOTER,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC,
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
  uniswapV3QuoterAbi,
  uniswapV3RouterAbi
} from "./contract";

export interface UniswapV3FixedSwapMetadata {
  fee: number;
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  inputToken: string;
  network: typeof Networks.Polygon;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  outputToken: string;
  pool: string;
  quoter: string;
  router: string;
}

export interface UniswapV3SimulationDependencies {
  quote?: (amountIn: bigint) => Promise<bigint>;
  verifyDeployment?: () => Promise<void>;
}

export const UniswapV3FixedSwapContext = defineContext<UniswapV3FixedSwapMetadata>()("uniswapV3FixedSwap");

function sameAddress(left: string, right: string): boolean {
  return getAddress(left) === getAddress(right);
}

export async function verifyPolygonEureUsdcDeployment(): Promise<void> {
  const client = EvmClientManager.getInstance().getClient(Networks.Polygon);
  const [token0, token1, fee, poolFactory, canonicalPool, routerFactory, quoterFactory] = await Promise.all([
    client.readContract({ abi: uniswapV3PoolAbi, address: POLYGON_EURE_USDC_POOL, functionName: "token0" }),
    client.readContract({ abi: uniswapV3PoolAbi, address: POLYGON_EURE_USDC_POOL, functionName: "token1" }),
    client.readContract({ abi: uniswapV3PoolAbi, address: POLYGON_EURE_USDC_POOL, functionName: "fee" }),
    client.readContract({ abi: uniswapV3PoolAbi, address: POLYGON_EURE_USDC_POOL, functionName: "factory" }),
    client.readContract({
      abi: uniswapV3FactoryAbi,
      address: POLYGON_UNISWAP_V3_FACTORY,
      args: [POLYGON_EURE, POLYGON_USDC, POLYGON_EURE_USDC_FEE],
      functionName: "getPool"
    }),
    client.readContract({ abi: uniswapV3RouterAbi, address: POLYGON_UNISWAP_V3_ROUTER, functionName: "factory" }),
    client.readContract({ abi: uniswapV3QuoterAbi, address: POLYGON_UNISWAP_V3_QUOTER, functionName: "factory" })
  ]);
  if (
    !sameAddress(token0, POLYGON_EURE) ||
    !sameAddress(token1, POLYGON_USDC) ||
    fee !== POLYGON_EURE_USDC_FEE ||
    !sameAddress(poolFactory, POLYGON_UNISWAP_V3_FACTORY) ||
    !sameAddress(canonicalPool, POLYGON_EURE_USDC_POOL) ||
    !sameAddress(routerFactory, POLYGON_UNISWAP_V3_FACTORY) ||
    !sameAddress(quoterFactory, POLYGON_UNISWAP_V3_FACTORY)
  ) {
    throw new Error("UniswapV3FixedSwap: Polygon EURe/USDC deployment does not match the pinned route");
  }
}

export async function quotePolygonEureToUsdc(amountIn: bigint): Promise<bigint> {
  const client = EvmClientManager.getInstance().getClient(Networks.Polygon);
  const { result } = await client.simulateContract({
    abi: uniswapV3QuoterAbi,
    address: POLYGON_UNISWAP_V3_QUOTER,
    args: [POLYGON_EURE, POLYGON_USDC, POLYGON_EURE_USDC_FEE, amountIn, 0n],
    functionName: "quoteExactInputSingle"
  });
  return result;
}

export async function simulateUniswapV3FixedSwap(
  input: PhaseIO<typeof MONERIUM_EURE, typeof Networks.Polygon>,
  ctx: PhaseCtx,
  dependencies: UniswapV3SimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<typeof EvmToken.USDC, typeof Networks.Polygon>, UniswapV3FixedSwapMetadata>> {
  if (input.chain !== Networks.Polygon || input.token !== MONERIUM_EURE || BigInt(input.amountRaw) <= 0n) {
    throw new Error("UniswapV3FixedSwap requires a positive EURe amount on Polygon");
  }
  await (dependencies.verifyDeployment ?? verifyPolygonEureUsdcDeployment)();
  const outputAmountRaw = await (dependencies.quote ?? quotePolygonEureToUsdc)(BigInt(input.amountRaw));
  if (outputAmountRaw <= 0n) throw new Error("UniswapV3FixedSwap returned no Polygon USDC output");
  const outputAmountDecimal = new Big(outputAmountRaw.toString()).div(new Big(10).pow(6));
  ctx.addNote(`UniswapV3FixedSwap: ${input.amount.toFixed()} EURE -> ${outputAmountDecimal.toFixed()} USDC on Polygon`);
  return {
    metadata: {
      fee: POLYGON_EURE_USDC_FEE,
      inputAmountDecimal: input.amount,
      inputAmountRaw: input.amountRaw,
      inputToken: POLYGON_EURE,
      network: Networks.Polygon,
      outputAmountDecimal,
      outputAmountRaw: outputAmountRaw.toString(),
      outputToken: POLYGON_USDC,
      pool: POLYGON_EURE_USDC_POOL,
      quoter: POLYGON_UNISWAP_V3_QUOTER,
      router: POLYGON_UNISWAP_V3_ROUTER
    },
    output: evmIO(EvmToken.USDC, Networks.Polygon, outputAmountDecimal, outputAmountRaw.toString())
  };
}
