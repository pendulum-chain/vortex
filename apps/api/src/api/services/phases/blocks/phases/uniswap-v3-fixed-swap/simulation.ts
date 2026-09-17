import { EvmClientManager, EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { getAddress } from "viem";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { MONERIUM_EURE } from "../monerium-issue/simulation";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_PATH,
  POLYGON_EURE_USDC_ROUTE,
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
  inputAmountDecimal: SerializableBig;
  inputAmountRaw: string;
  inputToken: string;
  network: typeof Networks.Polygon;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  outputToken: string;
  path: string;
  pools: string[];
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
  const [routerFactory, quoterFactory, ...hops] = await Promise.all([
    client.readContract({ abi: uniswapV3RouterAbi, address: POLYGON_UNISWAP_V3_ROUTER, functionName: "factory" }),
    client.readContract({ abi: uniswapV3QuoterAbi, address: POLYGON_UNISWAP_V3_QUOTER, functionName: "factory" }),
    ...POLYGON_EURE_USDC_ROUTE.map(hop =>
      Promise.all([
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "token0" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "token1" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "fee" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "factory" }),
        client.readContract({
          abi: uniswapV3FactoryAbi,
          address: POLYGON_UNISWAP_V3_FACTORY,
          args: [hop.tokenIn, hop.tokenOut, hop.fee],
          functionName: "getPool"
        })
      ])
    )
  ]);
  const hopsMatch = POLYGON_EURE_USDC_ROUTE.every((hop, index) => {
    const [token0, token1, fee, poolFactory, canonicalPool] = hops[index];
    const pair = [token0, token1].map(getAddress).sort();
    const expected = [hop.tokenIn, hop.tokenOut].map(getAddress).sort();
    return (
      pair[0] === expected[0] &&
      pair[1] === expected[1] &&
      fee === hop.fee &&
      sameAddress(poolFactory, POLYGON_UNISWAP_V3_FACTORY) &&
      sameAddress(canonicalPool, hop.pool)
    );
  });
  if (
    !hopsMatch ||
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
    args: [POLYGON_EURE_USDC_PATH, amountIn],
    functionName: "quoteExactInput"
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
      inputAmountDecimal: input.amount,
      inputAmountRaw: input.amountRaw,
      inputToken: POLYGON_EURE,
      network: Networks.Polygon,
      outputAmountDecimal,
      outputAmountRaw: outputAmountRaw.toString(),
      outputToken: POLYGON_USDC,
      path: POLYGON_EURE_USDC_PATH,
      pools: POLYGON_EURE_USDC_ROUTE.map(hop => hop.pool),
      quoter: POLYGON_UNISWAP_V3_QUOTER,
      router: POLYGON_UNISWAP_V3_ROUTER
    },
    output: evmIO(EvmToken.USDC, Networks.Polygon, outputAmountDecimal, outputAmountRaw.toString())
  };
}
