import { EvmClientManager, type EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { getAddress } from "viem";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import {
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_FACTORY,
  ROBINHOOD_UNISWAP_QUOTER_V2,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  ROBINHOOD_USDG_ADDRESS,
  type StockSymbol
} from "../../core/robinhood-stocks";
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
  uniswapV3QuoterV2Abi,
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

interface UniswapDeployment {
  factory: `0x${string}`;
  hops: readonly { fee: number; pool: `0x${string}`; tokenIn: `0x${string}`; tokenOut: `0x${string}` }[];
  label: string;
  network: EvmNetworks;
  quoter: `0x${string}`;
  router: `0x${string}`;
}

/** Router and quoter on the pinned factory, each pool holding the expected pair and fee and canonical on that factory. */
async function verifyUniswapDeployment({ factory, hops, label, network, quoter, router }: UniswapDeployment): Promise<void> {
  const client = EvmClientManager.getInstance().getClient(network);
  const [routerFactory, quoterFactory, ...readHops] = await Promise.all([
    client.readContract({ abi: uniswapV3RouterAbi, address: router, functionName: "factory" }),
    client.readContract({ abi: uniswapV3QuoterAbi, address: quoter, functionName: "factory" }),
    ...hops.map(hop =>
      Promise.all([
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "token0" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "token1" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "fee" }),
        client.readContract({ abi: uniswapV3PoolAbi, address: hop.pool, functionName: "factory" }),
        client.readContract({
          abi: uniswapV3FactoryAbi,
          address: factory,
          args: [hop.tokenIn, hop.tokenOut, hop.fee],
          functionName: "getPool"
        })
      ])
    )
  ]);
  const hopsMatch = hops.every((hop, index) => {
    const [token0, token1, fee, poolFactory, canonicalPool] = readHops[index];
    // Not `.map(getAddress)`: its second parameter is a chain id, so the array index would change the checksum.
    const pair = [token0, token1].map(address => getAddress(address)).sort();
    const expected = [hop.tokenIn, hop.tokenOut].map(address => getAddress(address)).sort();
    return (
      pair[0] === expected[0] &&
      pair[1] === expected[1] &&
      fee === hop.fee &&
      sameAddress(poolFactory, factory) &&
      sameAddress(canonicalPool, hop.pool)
    );
  });
  if (!hopsMatch || !sameAddress(routerFactory, factory) || !sameAddress(quoterFactory, factory)) {
    throw new Error(`UniswapV3FixedSwap: ${label} deployment does not match the pinned route`);
  }
}

export async function verifyPolygonEureUsdcDeployment(): Promise<void> {
  await verifyUniswapDeployment({
    factory: POLYGON_UNISWAP_V3_FACTORY,
    hops: POLYGON_EURE_USDC_ROUTE,
    label: "Polygon EURe/USDC",
    network: Networks.Polygon,
    quoter: POLYGON_UNISWAP_V3_QUOTER,
    router: POLYGON_UNISWAP_V3_ROUTER
  });
}

export async function verifyStockSwapDeployment(symbol: StockSymbol): Promise<void> {
  const { address, uniswapFee, uniswapPool } = ROBINHOOD_STOCKS[symbol];
  await verifyUniswapDeployment({
    factory: ROBINHOOD_UNISWAP_FACTORY,
    hops: [{ fee: uniswapFee, pool: uniswapPool, tokenIn: ROBINHOOD_USDG_ADDRESS, tokenOut: address }],
    label: `Robinhood ${symbol}/USDG`,
    network: Networks.Robinhood,
    quoter: ROBINHOOD_UNISWAP_QUOTER_V2,
    router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02
  });
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

export async function quoteStockSwap(path: `0x${string}`, amountIn: bigint): Promise<bigint> {
  const client = EvmClientManager.getInstance().getClient(Networks.Robinhood);
  const {
    result: [amountOut]
  } = await client.simulateContract({
    abi: uniswapV3QuoterV2Abi,
    address: ROBINHOOD_UNISWAP_QUOTER_V2,
    args: [path, amountIn],
    functionName: "quoteExactInput"
  });
  return amountOut;
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
