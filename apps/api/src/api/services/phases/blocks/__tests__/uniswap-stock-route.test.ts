import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type EvmTransactionData, Networks, type PresignedTx, RampDirection } from "@vortexfi/shared";
import { decodeFunctionData, decodeFunctionResult, encodeFunctionData, encodePacked, erc20Abi, keccak256, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { type FakeEvm, installFakeEvm } from "../../../../../test-utils/fake-world/fake-evm";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError, UnrecoverablePhaseError } from "../../../../errors/phase-error";
import * as financialOperationNamespace from "../core/financial-operation";
import {
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_FACTORY,
  ROBINHOOD_UNISWAP_QUOTER_V2,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  ROBINHOOD_USDG_ADDRESS,
  type StockSymbol
} from "../core/robinhood-stocks";
import {
  encodeUniswapSwap,
  POLYGON_EURE,
  POLYGON_EURE_USDC_PATH,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC,
  stockSwapPath,
  stockSwapTokens,
  swapRouter02Abi,
  uniswapV3QuoterV2Abi,
  uniswapV3RouterAbi
} from "../phases/uniswap-v3-fixed-swap/contract";
import { resolveUniswapRoute, type UniswapRoute } from "../phases/uniswap-v3-fixed-swap/route";
import { quoteStockSwap, verifyStockSwapDeployment } from "../phases/uniswap-v3-fixed-swap/simulation";
import { validateUniswapApproval, validateUniswapSwap } from "../phases/uniswap-v3-fixed-swap/validation";

const financialOperationReal = { ...financialOperationNamespace };
const operationAttempts: string[] = [];
const operationRows = new Map<string, "submitted" | "confirmed">();

mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({
    attemptClass,
    perform,
    reconcile
  }: {
    attemptClass: string;
    perform(key: string): Promise<unknown>;
    reconcile?: (operation: unknown) => Promise<unknown>;
  }) => {
    operationAttempts.push(attemptClass);
    if (operationRows.get(attemptClass) === "submitted") {
      const reconciled = reconcile ? await reconcile({}) : null;
      if (reconciled === null) throw new Error(`operation ${attemptClass} has submitted outcome`);
      return reconciled;
    }
    return perform(`test-${attemptClass}`);
  }
}));

const { UniswapApproveExecutor, UniswapSwapExecutor } = await import("../phases/uniswap-v3-fixed-swap/execution");

afterAll(() => {
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

const ephemeral = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const DEPOSIT_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const OTHER = "0x1111111111111111111111111111111111111111";
const FUTURE_DEADLINE = String(Math.floor(Date.now() / 1000) + 3600);
const robinhoodChainId = 4663;

const AMOUNTS = {
  [RampDirection.BUY]: { hard: "522000000000000000", input: "100000000", output: "549628082627042243", soft: "538000000000000000" },
  [RampDirection.SELL]: { hard: "17264526", input: "100000000000000000", output: "18173185", soft: "17809721" }
};

function stockBlock(direction: RampDirection, symbol: StockSymbol = "NVDA" as StockSymbol) {
  const { inputToken, outputToken } = stockSwapTokens(symbol, direction);
  const amounts = AMOUNTS[direction];
  return {
    direction,
    swap: {
      costUsd: "0.05",
      hardMinimumOutputRaw: amounts.hard,
      inputAmountRaw: amounts.input,
      inputToken,
      network: Networks.Robinhood,
      outputAmountRaw: amounts.output,
      outputToken,
      path: stockSwapPath(symbol, direction),
      pools: [ROBINHOOD_STOCKS[symbol].uniswapPool],
      quoter: ROBINHOOD_UNISWAP_QUOTER_V2,
      router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
      routerKind: "swapRouter02",
      softMinimumOutputRaw: amounts.soft
    },
    token: symbol
  };
}

function stockState(direction: RampDirection, deadline = FUTURE_DEADLINE) {
  return {
    blockState: {
      stockRoute: {
        relayRequestId: "0xrelay",
        swapDeadline: deadline,
        ...(direction === RampDirection.SELL ? { relayDepositAddress: DEPOSIT_ADDRESS } : {})
      }
    },
    evmEphemeralAddress: ephemeral.address,
    flow: { id: "test-flow", version: 1 }
  };
}

function resolved(direction: RampDirection): UniswapRoute {
  return resolveUniswapRoute({ blocks: { stockRoute: stockBlock(direction) } }, stockState(direction) as never, ephemeral.address);
}

function approvalBlueprint(route: UniswapRoute): PresignedTx {
  return {
    meta: {},
    network: route.network,
    nonce: 0,
    phase: "uniswapApprove",
    signer: ephemeral.address,
    txData: {
      data: encodeFunctionData({ abi: erc20Abi, args: [route.router, BigInt(route.amountInRaw)], functionName: "approve" }),
      gas: "100000",
      maxFeePerGas: "20000000",
      maxPriorityFeePerGas: "1000000",
      to: route.inputToken,
      value: "0"
    }
  } as PresignedTx;
}

function swapBlueprint(route: UniswapRoute): PresignedTx {
  return {
    meta: {},
    network: route.network,
    nonce: 1,
    phase: "uniswapSwap",
    signer: ephemeral.address,
    txData: {
      data: encodeUniswapSwap(route.kind, {
        amountIn: BigInt(route.amountInRaw),
        amountOutMinimum: BigInt(route.hardMinimumOutputRaw),
        deadline: BigInt(route.deadline),
        path: route.path,
        recipient: route.recipient
      }),
      gas: "500000",
      maxFeePerGas: "20000000",
      maxPriorityFeePerGas: "1000000",
      to: route.router,
      value: "0"
    }
  } as PresignedTx;
}

async function sign(unsigned: PresignedTx, chainId = robinhoodChainId): Promise<PresignedTx> {
  const txData = unsigned.txData as EvmTransactionData;
  const serialized = await ephemeral.signTransaction({
    chainId,
    data: txData.data as `0x${string}`,
    gas: BigInt(txData.gas),
    maxFeePerGas: BigInt(txData.maxFeePerGas as string),
    maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas as string),
    nonce: unsigned.nonce,
    to: txData.to as `0x${string}`,
    type: "eip1559",
    value: BigInt(txData.value)
  });
  return { ...unsigned, txData: serialized };
}

function withData(blueprint: PresignedTx, patch: Partial<EvmTransactionData>): PresignedTx {
  return { ...blueprint, txData: { ...(blueprint.txData as EvmTransactionData), ...patch } };
}

describe("SwapRouter02 and QuoterV2 encoding", () => {
  const params = {
    amountIn: 100_000_000n,
    amountOutMinimum: 1n,
    path: stockSwapPath("NVDA" as StockSymbol, RampDirection.BUY),
    recipient: ephemeral.address
  };

  it("wraps exactInput in the deadline multicall, the selectors the router on 4663 has", () => {
    const data = encodeUniswapSwap("swapRouter02", { ...params, deadline: 1234n });
    expect(data.slice(0, 10)).toBe("0x5ae401dc");
    const outer = decodeFunctionData({ abi: swapRouter02Abi, data });
    if (outer.functionName !== "multicall") throw new Error("not multicall");
    const [deadline, calls] = outer.args;
    expect(deadline).toBe(1234n);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 10)).toBe("0xb858183f");
    const inner = decodeFunctionData({ abi: swapRouter02Abi, data: calls[0] });
    expect(inner.functionName).toBe("exactInput");
    expect(inner.args?.[0]).toEqual(params as never);
  });

  it("keeps the original router's encoding for the v1 kind", () => {
    const data = encodeUniswapSwap("v1", { ...params, deadline: 1234n });
    expect(data).toBe(encodeFunctionData({ abi: uniswapV3RouterAbi, args: [{ ...params, deadline: 1234n }], functionName: "exactInput" }));
    expect(data.slice(0, 10)).toBe("0xc04b8d59");
  });

  it("decodes the four values a real QuoterV2 call on 4663 returned", () => {
    // eth_call quoteExactInput(USDG -> NVDA, 100 USDG) on 2026-11-05.
    const raw =
      "0x00000000000000000000000000000000000000000000000007a0abd43f905bc3000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000001a9cc000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000121aa2695730ac304eef8c89bc31000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000";
    const [amountOut, sqrtPrices, ticksCrossed, gasEstimate] = decodeFunctionResult({
      abi: uniswapV3QuoterV2Abi,
      data: raw,
      functionName: "quoteExactInput"
    });
    expect(amountOut).toBe(549_628_082_627_042_243n);
    expect(sqrtPrices).toHaveLength(1);
    expect(ticksCrossed).toEqual([0]);
    expect(gasEstimate).toBe(109_004n);
  });

  it("orders the single-hop path from input to output through the pinned fee", () => {
    const { address, uniswapFee } = ROBINHOOD_STOCKS.NVDA;
    expect(stockSwapPath("NVDA" as StockSymbol, RampDirection.BUY)).toBe(
      encodePacked(["address", "uint24", "address"], [ROBINHOOD_USDG_ADDRESS, uniswapFee, address])
    );
    expect(stockSwapPath("NVDA" as StockSymbol, RampDirection.SELL)).toBe(
      encodePacked(["address", "uint24", "address"], [address, uniswapFee, ROBINHOOD_USDG_ADDRESS])
    );
  });
});

describe("resolveUniswapRoute", () => {
  const polygonMetadata = { blocks: { uniswapV3FixedSwap: { inputAmountRaw: "100" } } };
  const polygonState = {
    blockState: { uniswapV3FixedSwap: { deadline: "55", hardMinimumOutputRaw: "95", softMinimumOutputRaw: "98" } }
  };

  it("falls back to the pinned Polygon route with its persisted minimums", () => {
    const route = resolveUniswapRoute(polygonMetadata, polygonState as never, ephemeral.address);
    expect(route).toMatchObject({
      amountInRaw: "100",
      deadline: "55",
      hardMinimumOutputRaw: "95",
      inputToken: POLYGON_EURE,
      kind: "v1",
      network: Networks.Polygon,
      outputToken: POLYGON_USDC,
      path: POLYGON_EURE_USDC_PATH,
      recipient: ephemeral.address,
      router: POLYGON_UNISWAP_V3_ROUTER,
      softMinimumOutputRaw: "98"
    });
    expect(route.stock).toBeUndefined();
  });

  it("keeps failing plainly when Polygon metadata is missing", () => {
    expect(() => resolveUniswapRoute({ blocks: {} }, polygonState as never, ephemeral.address)).toThrow(
      "Missing uniswapV3FixedSwap block metadata"
    );
  });

  it("reads a buy from blocks.stockRoute.swap, delivering to the signer", () => {
    expect(resolved(RampDirection.BUY)).toMatchObject({
      amountInRaw: AMOUNTS.BUY.input,
      deadline: FUTURE_DEADLINE,
      hardMinimumOutputRaw: AMOUNTS.BUY.hard,
      inputToken: ROBINHOOD_USDG_ADDRESS,
      kind: "swapRouter02",
      network: Networks.Robinhood,
      outputToken: ROBINHOOD_STOCKS.NVDA.address,
      recipient: ephemeral.address,
      router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
      softMinimumOutputRaw: AMOUNTS.BUY.soft,
      stock: "NVDA"
    });
  });

  it("reads a sell with the stored Relay deposit address as the recipient", () => {
    expect(resolved(RampDirection.SELL)).toMatchObject({
      inputToken: ROBINHOOD_STOCKS.NVDA.address,
      outputToken: ROBINHOOD_USDG_ADDRESS,
      recipient: DEPOSIT_ADDRESS
    });
  });

  it("prefers the stock block when both are present", () => {
    const route = resolveUniswapRoute(
      { blocks: { stockRoute: stockBlock(RampDirection.BUY), ...polygonMetadata.blocks } },
      stockState(RampDirection.BUY) as never,
      ephemeral.address
    );
    expect(route.network).toBe(Networks.Robinhood);
  });

  type Block = ReturnType<typeof stockBlock>;
  const swapPatch = (patch: Partial<Block["swap"]>) => (block: Block) => ({ ...block, swap: { ...block.swap, ...patch } });

  it.each<[string, (block: Block) => unknown]>([
    ["router", swapPatch({ router: OTHER })],
    ["quoter", swapPatch({ quoter: OTHER })],
    ["input token", swapPatch({ inputToken: OTHER as never })],
    ["output token", swapPatch({ outputToken: OTHER as never })],
    ["lookalike USDG", swapPatch({ inputToken: "0x0A3B763d66c0e8c7555c986A3701E1DC1Bf3954F" as never })],
    ["path", swapPatch({ path: stockSwapPath("TSLA" as StockSymbol, RampDirection.BUY) })],
    ["pool", swapPatch({ pools: [OTHER] })],
    ["pool count", swapPatch({ pools: [ROBINHOOD_STOCKS.NVDA.uniswapPool, OTHER] })],
    ["network", swapPatch({ network: Networks.Polygon as never })],
    ["router kind", swapPatch({ routerKind: "v1" })],
    ["zero input", swapPatch({ inputAmountRaw: "0" })],
    ["zero hard minimum", swapPatch({ hardMinimumOutputRaw: "0" })],
    ["soft minimum below hard", swapPatch({ softMinimumOutputRaw: "1" })],
    ["non-numeric minimum", swapPatch({ hardMinimumOutputRaw: "many" })],
    ["unlisted token", block => ({ ...block, token: "SHIB" })],
    ["direction", block => ({ ...block, direction: "SIDEWAYS" })],
    ["direction flipped against the tokens", block => ({ ...block, direction: RampDirection.SELL })],
    ["missing swap", block => ({ ...block, swap: undefined })]
  ])("pauses instead of trusting metadata with a wrong %s", (_label, mutate) => {
    expect(() =>
      resolveUniswapRoute(
        { blocks: { stockRoute: mutate(stockBlock(RampDirection.BUY)) } },
        stockState(RampDirection.BUY) as never,
        ephemeral.address
      )
    ).toThrow(ReconciliationRequiredPhaseError);
  });

  it.each<[string, Record<string, unknown>]>([
    ["no block state", {}],
    ["no deadline", { blockState: { stockRoute: { relayDepositAddress: DEPOSIT_ADDRESS } } }],
    ["no deposit address", { blockState: { stockRoute: { swapDeadline: FUTURE_DEADLINE } } }],
    ["a malformed deposit address", { blockState: { stockRoute: { relayDepositAddress: "0x12", swapDeadline: FUTURE_DEADLINE } } }],
    ["the signer as deposit address", { blockState: { stockRoute: { relayDepositAddress: ephemeral.address, swapDeadline: FUTURE_DEADLINE } } }]
  ])("pauses a sell with %s", (_label, state) => {
    expect(() =>
      resolveUniswapRoute({ blocks: { stockRoute: stockBlock(RampDirection.SELL) } }, state as never, ephemeral.address)
    ).toThrow(ReconciliationRequiredPhaseError);
  });
});

describe("stock deployment verification and quote", () => {
  let fakeEvm: FakeEvm;
  let restore: () => void;

  beforeEach(() => {
    ({ fakeEvm, restore } = installFakeEvm());
  });

  afterEach(() => {
    restore();
  });

  /** Answers as the chain does: a pool's token0 is the numerically lower address, whichever side the stock is on. */
  function scriptDeployment(symbol: StockSymbol, patch: Record<string, unknown> = {}) {
    const { address, uniswapFee, uniswapPool } = ROBINHOOD_STOCKS[symbol];
    const [token0, token1] = [ROBINHOOD_USDG_ADDRESS, address].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    fakeEvm.onReadContract = (network, params) => {
      expect(network).toBe(Networks.Robinhood);
      const key = `${params.functionName}@${params.address.toLowerCase()}`;
      if (key in patch) return patch[key];
      if (params.functionName in patch) return patch[params.functionName];
      switch (params.functionName) {
        case "factory":
          return ROBINHOOD_UNISWAP_FACTORY;
        case "fee":
          return uniswapFee;
        case "getPool":
          expect(params.address).toBe(ROBINHOOD_UNISWAP_FACTORY);
          expect(params.args).toEqual([ROBINHOOD_USDG_ADDRESS, address, uniswapFee]);
          return uniswapPool;
        case "token0":
          return token0;
        case "token1":
          return token1;
        default:
          return undefined;
      }
    };
  }

  it("passes for all 12 pins, on either side of USDG in the pool's token order", async () => {
    const symbols = Object.keys(ROBINHOOD_STOCKS) as StockSymbol[];
    const belowUsdg = symbols.filter(symbol => BigInt(ROBINHOOD_STOCKS[symbol].address) < BigInt(ROBINHOOD_USDG_ADDRESS));
    expect(belowUsdg.length).toBeGreaterThan(0);
    expect(belowUsdg.length).toBeLessThan(symbols.length);
    for (const symbol of symbols) {
      scriptDeployment(symbol);
      await verifyStockSwapDeployment(symbol);
    }
  });

  const pool = ROBINHOOD_STOCKS.NVDA.uniswapPool;
  it.each<[string, Record<string, unknown>]>([
    ["a pool with another token", { token1: OTHER }],
    ["a pool with another fee", { fee: 3000 }],
    ["a pool on another factory", { [`factory@${pool.toLowerCase()}`]: OTHER }],
    ["a pool the factory does not know", { getPool: OTHER }],
    ["a router on another factory", { [`factory@${ROBINHOOD_UNISWAP_SWAP_ROUTER_02}`]: OTHER }],
    ["a quoter on another factory", { [`factory@${ROBINHOOD_UNISWAP_QUOTER_V2}`]: OTHER }]
  ])("rejects %s", async (_label, patch) => {
    scriptDeployment("NVDA" as StockSymbol, patch);
    await expect(verifyStockSwapDeployment("NVDA" as StockSymbol)).rejects.toThrow("does not match the pinned route");
  });

  it("quotes through QuoterV2 and returns the first of its four values", async () => {
    const path = stockSwapPath("NVDA" as StockSymbol, RampDirection.BUY);
    fakeEvm.onSimulateContract = (network, params) => {
      expect(network).toBe(Networks.Robinhood);
      expect(params.address).toBe(ROBINHOOD_UNISWAP_QUOTER_V2);
      expect(params.functionName).toBe("quoteExactInput");
      expect(params.args).toEqual([path, 7n]);
      return [42n, [1n], [0], 100_000n] as const;
    };
    expect(await quoteStockSwap(path, 7n)).toBe(42n);
  });

  it("route.quote and route.verifyDeployment reach the stock's own pins", async () => {
    const route = resolved(RampDirection.SELL);
    scriptDeployment("NVDA" as StockSymbol);
    await route.verifyDeployment();
    fakeEvm.onSimulateContract = (_network, params) => {
      expect(params.args).toEqual([stockSwapPath("NVDA" as StockSymbol, RampDirection.SELL), 9n]);
      return [11n, [], [], 0n] as const;
    };
    expect(await route.quote(9n)).toBe(11n);
  });
});

describe("stock route presigned validation", () => {
  it.each([RampDirection.BUY, RampDirection.SELL])("accepts the route's own %s approval and swap", async direction => {
    const route = resolved(direction);
    await expect(validateUniswapApproval(await sign(approvalBlueprint(route)), route)).resolves.toStartWith("0x");
    await expect(validateUniswapSwap(await sign(swapBlueprint(route)), route)).resolves.toStartWith("0x");
  });

  it.each<[string, (route: UniswapRoute) => Partial<EvmTransactionData>]>([
    ["a different spender", route => ({
      data: encodeFunctionData({ abi: erc20Abi, args: [OTHER, BigInt(route.amountInRaw)], functionName: "approve" })
    })],
    ["the Polygon router as spender", route => ({
      data: encodeFunctionData({ abi: erc20Abi, args: [POLYGON_UNISWAP_V3_ROUTER, BigInt(route.amountInRaw)], functionName: "approve" })
    })],
    ["an amount above the input", route => ({
      data: encodeFunctionData({ abi: erc20Abi, args: [route.router, BigInt(route.amountInRaw) + 1n], functionName: "approve" })
    })],
    ["another token", () => ({ to: OTHER })],
    ["a transfer instead of an approval", route => ({
      data: encodeFunctionData({ abi: erc20Abi, args: [route.router, BigInt(route.amountInRaw)], functionName: "transfer" })
    })],
    ["a native value", () => ({ value: "1" })]
  ])("rejects an approval with %s", async (_label, patch) => {
    const route = resolved(RampDirection.BUY);
    await expect(validateUniswapApproval(await sign(withData(approvalBlueprint(route), patch(route))), route)).rejects.toThrow();
  });

  const fields = (route: UniswapRoute) => ({
    amountIn: BigInt(route.amountInRaw),
    amountOutMinimum: BigInt(route.hardMinimumOutputRaw),
    deadline: BigInt(route.deadline),
    path: route.path,
    recipient: route.recipient
  });
  const routerSwap = (route: UniswapRoute, patch: Partial<ReturnType<typeof fields>>) =>
    encodeUniswapSwap("swapRouter02", { ...fields(route), ...patch });
  const innerCall = (route: UniswapRoute) => {
    const { deadline: _deadline, ...params } = fields(route);
    return encodeFunctionData({ abi: swapRouter02Abi, args: [params], functionName: "exactInput" });
  };

  it.each<[string, RampDirection, (route: UniswapRoute) => `0x${string}`]>([
    ["recipient", RampDirection.BUY, route => routerSwap(route, { recipient: OTHER })],
    ["recipient kept as the signer on a sell", RampDirection.SELL, route => routerSwap(route, { recipient: ephemeral.address })],
    ["recipient on a sell", RampDirection.SELL, route => routerSwap(route, { recipient: OTHER })],
    ["deadline", RampDirection.BUY, route => routerSwap(route, { deadline: BigInt(route.deadline) + 1n })],
    ["amountIn", RampDirection.BUY, route => routerSwap(route, { amountIn: BigInt(route.amountInRaw) + 1n })],
    ["amountOutMinimum", RampDirection.BUY, route => routerSwap(route, { amountOutMinimum: BigInt(route.hardMinimumOutputRaw) - 1n })],
    ["fee tier", RampDirection.BUY, route => routerSwap(route, {
      path: encodePacked(["address", "uint24", "address"], [ROBINHOOD_USDG_ADDRESS, 100, ROBINHOOD_STOCKS.NVDA.address])
    })],
    ["reversed path", RampDirection.BUY, route => routerSwap(route, { path: stockSwapPath("NVDA" as StockSymbol, RampDirection.SELL) })],
    ["second call in the multicall", RampDirection.BUY, route => encodeFunctionData({
      abi: swapRouter02Abi,
      args: [BigInt(route.deadline), [innerCall(route), innerCall(route)]],
      functionName: "multicall"
    })],
    ["bare exactInput without the deadline wrapper", RampDirection.BUY, route => innerCall(route)],
    ["multicall overload without a deadline", RampDirection.BUY, route => encodeFunctionData({
      abi: parseAbi(["function multicall(bytes[] data) payable returns (bytes[] results)"]),
      args: [[innerCall(route)]],
      functionName: "multicall"
    })],
    ["v1 router encoding", RampDirection.BUY, route => encodeUniswapSwap("v1", fields(route))]
  ])("rejects a swap with a wrong %s", async (_label, direction, data) => {
    const route = resolved(direction);
    const signed = await sign(withData(swapBlueprint(route), { data: data(route) }));
    await expect(validateUniswapSwap(signed, route)).rejects.toThrow("does not match the fixed Robinhood NVDA/USDG route");
  });

  it("rejects a swap sent to another router", async () => {
    const route = resolved(RampDirection.BUY);
    await expect(validateUniswapSwap(await sign(withData(swapBlueprint(route), { to: POLYGON_UNISWAP_V3_ROUTER })), route)).rejects.toThrow(
      "signer or router does not match"
    );
  });

  it("rejects a transaction identified for or signed on another network", async () => {
    const route = resolved(RampDirection.BUY);
    const signed = await sign(swapBlueprint(route));
    await expect(validateUniswapSwap({ ...signed, network: Networks.Polygon }, route)).rejects.toThrow("identity is invalid");
    await expect(validateUniswapSwap(await sign(swapBlueprint(route), 137), route)).rejects.toThrow("signer, chain, nonce, or value");
  });

  it("does not let a stock swap pass against the default Polygon target", async () => {
    const route = resolved(RampDirection.BUY);
    await expect(
      validateUniswapSwap(await sign(swapBlueprint(route)), {
        amountInRaw: route.amountInRaw,
        deadline: route.deadline,
        hardMinimumOutputRaw: route.hardMinimumOutputRaw,
        signer: route.signer
      })
    ).rejects.toThrow("identity is invalid");
  });
});

describe("stock route execution", () => {
  const originalFindByPk = QuoteTicket.findByPk;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
  });

  type Dependencies = NonNullable<ConstructorParameters<typeof UniswapSwapExecutor>[0]>;

  async function rampState(direction: RampDirection, phase: "uniswapApprove" | "uniswapSwap", deadline?: string) {
    const route = resolveUniswapRoute(
      { blocks: { stockRoute: stockBlock(direction) } },
      stockState(direction, deadline) as never,
      ephemeral.address
    );
    const approval = approvalBlueprint(route);
    const swap = swapBlueprint(route);
    QuoteTicket.findByPk = mock(async () => ({ metadata: { blocks: { stockRoute: stockBlock(direction) } } })) as typeof QuoteTicket.findByPk;
    return {
      route,
      state: {
        currentPhase: phase,
        errorLogs: [],
        get() {
          return this;
        },
        id: "ramp-stock-1",
        phaseHistory: [],
        presignedTxs: [await sign(approval), await sign(swap)],
        quoteId: "quote-stock-1",
        state: stockState(direction, deadline),
        unsignedTxs: [approval, swap],
        async update(update: Record<string, unknown>) {
          Object.assign(this, update);
          return this;
        }
      }
    };
  }

  function dependencies(route: UniswapRoute, overrides: Partial<Dependencies> = {}) {
    const amount = BigInt(route.amountInRaw);
    const world = { allowance: amount, outputBalance: 0n };
    const sendRawTransaction = mock(async (transaction: `0x${string}`) => {
      world.allowance = 0n;
      world.outputBalance = BigInt(AMOUNTS[route.inputToken === ROBINHOOD_USDG_ADDRESS ? RampDirection.BUY : RampDirection.SELL].output);
      return keccak256(transaction);
    });
    const getBalance = mock(async (token: `0x${string}`, _owner: `0x${string}`) =>
      token === route.inputToken ? amount : world.outputBalance
    );
    const deps: Dependencies = {
      getAllowance: async () => world.allowance,
      getBalance,
      getReceipt: async () => null,
      quote: async () => BigInt(route.softMinimumOutputRaw),
      readStockFlags: mock(async () => ({ paused: false })),
      sendRawTransaction,
      simulateTransaction: mock(async () => {}),
      verifyDeployment: mock(async () => {}),
      waitForReceipt: async () => ({ status: "success" }),
      ...overrides
    };
    return { deps, getBalance, sendRawTransaction };
  }

  async function run(
    Executor: typeof UniswapApproveExecutor | typeof UniswapSwapExecutor,
    state: unknown,
    deps?: Dependencies
  ): Promise<unknown> {
    operationAttempts.length = 0;
    operationRows.clear();
    return new Executor(deps)
      .execute(state as never)
      .then(() => null)
      .catch((error: unknown) => error);
  }

  it("runs a buy's approval and swap, checking the output on the ephemeral", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    const { deps, getBalance, sendRawTransaction } = dependencies(route);

    expect(await run(UniswapSwapExecutor, state, deps)).toBeNull();

    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(operationAttempts).toEqual(["uniswap-presigned-broadcast"]);
    expect(deps.readStockFlags).toHaveBeenCalledWith("NVDA" as StockSymbol);
    expect(deps.verifyDeployment).toHaveBeenCalledTimes(1);
    expect(deps.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(getBalance).toHaveBeenCalledWith(route.outputToken, ephemeral.address);
  });

  it("does not check the output on a sell, where it goes to the deposit address", async () => {
    const { route, state } = await rampState(RampDirection.SELL, "uniswapSwap");
    const { deps, getBalance, sendRawTransaction } = dependencies(route);

    expect(await run(UniswapSwapExecutor, state, deps)).toBeNull();

    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    const sent = sendRawTransaction.mock.calls[0][0];
    expect(sent).toBe((state.presignedTxs[1] as { txData: string }).txData as `0x${string}`);
    expect(getBalance).not.toHaveBeenCalledWith(route.outputToken, expect.anything());
  });

  it("pauses a buy whose swap produced less than the hard minimum", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    let sent = false;
    const { deps } = dependencies(route, {
      getBalance: async token => (token === route.inputToken ? BigInt(route.amountInRaw) : sent ? BigInt(route.hardMinimumOutputRaw) - 1n : 0n),
      sendRawTransaction: async transaction => {
        sent = true;
        return keccak256(transaction);
      },
      getAllowance: async () => (sent ? 0n : BigInt(route.amountInRaw))
    });
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("NVDA, below");
  });

  it.each([
    ["uniswapSwap", UniswapSwapExecutor],
    ["uniswapApprove", UniswapApproveExecutor]
  ] as const)("holds %s while the issuer has paused the token", async (phase, Executor) => {
    const { route, state } = await rampState(RampDirection.SELL, phase);
    const { deps, sendRawTransaction } = dependencies(route, { readStockFlags: async () => ({ paused: true }) });
    const warn = spyOn(logger, "warn");
    const error = await run(Executor, state, deps);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("paused by the issuer");
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(operationAttempts).toEqual([]);
    expect(warn.mock.calls.some(([message]) => String(message).startsWith("UNISWAP_SWAP_HELD"))).toBe(true);
    warn.mockRestore();
  });

  it.each([
    ["uniswapSwap", UniswapSwapExecutor],
    ["uniswapApprove", UniswapApproveExecutor]
  ] as const)("holds %s below the soft minimum and logs the code", async (phase, Executor) => {
    const { route, state } = await rampState(RampDirection.BUY, phase);
    const { deps, sendRawTransaction } = dependencies(route, { quote: async () => BigInt(route.softMinimumOutputRaw) - 1n });
    const warn = spyOn(logger, "warn");
    const error = await run(Executor, state, deps);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("soft minimum");
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([message]) => String(message).startsWith("UNISWAP_SWAP_HELD"))).toBe(true);
    warn.mockRestore();
  });

  it("approves exactly and pauses when the allowance disagrees", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapApprove");
    const good = dependencies(route, { getAllowance: async () => BigInt(route.amountInRaw) });
    expect(await run(UniswapApproveExecutor, state, good.deps)).toBeNull();
    expect(good.sendRawTransaction).toHaveBeenCalledTimes(1);

    const bad = dependencies(route, { getAllowance: async () => 1n });
    const error = await run(UniswapApproveExecutor, state, bad.deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
  });

  it("finishes a resumed swap whose transaction settled, even while paused", async () => {
    const { route, state } = await rampState(RampDirection.SELL, "uniswapSwap");
    const { deps, sendRawTransaction } = dependencies(route, {
      getAllowance: async () => 0n,
      getReceipt: mock(async () => ({ status: "success" as const })),
      readStockFlags: async () => ({ paused: true })
    });
    expect(await run(UniswapSwapExecutor, state, deps)).toBeNull();
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(deps.simulateTransaction).not.toHaveBeenCalled();
  });

  it("retries a preflight read failure without failing the ramp", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    const { deps, sendRawTransaction } = dependencies(route, {
      verifyDeployment: async () => {
        throw new Error("RPC unavailable");
      }
    });
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("retries when the simulated swap reverts, without sending it", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    const { deps, sendRawTransaction } = dependencies(route, {
      simulateTransaction: async () => {
        throw new Error("execution reverted: Too little received");
      }
    });
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it.each([RampDirection.BUY, RampDirection.SELL])("pauses a %s when a mined swap reverted, never failing the ramp", async direction => {
    const { route, state } = await rampState(direction, "uniswapSwap");
    const { deps } = dependencies(route, { waitForReceipt: async () => ({ status: "reverted" }) });
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("reverted");
  });

  it("passes a reconciliation verdict from the journal through", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    const { deps } = dependencies(route, {
      waitForReceipt: async () => {
        throw new financialOperationReal.FinancialOperationReconciliationRequiredError({ id: "op" } as never, "has unknown outcome");
      }
    });
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
  });

  it("pauses on a presigned swap that does not match the route, sending nothing", async () => {
    const { route, state } = await rampState(RampDirection.SELL, "uniswapSwap");
    const forged = withData(swapBlueprint(route), {
      data: encodeUniswapSwap("swapRouter02", {
        amountIn: BigInt(route.amountInRaw),
        amountOutMinimum: BigInt(route.hardMinimumOutputRaw),
        deadline: BigInt(route.deadline),
        path: route.path,
        recipient: OTHER
      })
    });
    state.presignedTxs[1] = await sign(forged);
    state.unsignedTxs[1] = forged;
    const { deps, sendRawTransaction } = dependencies(route);
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("does not match the fixed Robinhood NVDA/USDG route");
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("pauses on a presigned swap that differs from its server-issued blueprint", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap");
    state.presignedTxs[1] = await sign(withData(swapBlueprint(route), { gas: "500001" }));
    const { deps, sendRawTransaction } = dependencies(route);
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("pauses when a presigned stock transaction is missing, never failing the ramp", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapApprove");
    state.presignedTxs = [];
    const { deps } = dependencies(route);
    const error = await run(UniswapApproveExecutor, state, deps);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(error).not.toBeInstanceOf(UnrecoverablePhaseError);
  });

  it("keeps retrying past the signed deadline, as the Polygon route does", async () => {
    const { route, state } = await rampState(RampDirection.BUY, "uniswapSwap", "1000");
    const { deps } = dependencies(route);
    const error = await run(UniswapSwapExecutor, state, deps);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect((error as Error).message).toContain("expired");
  });

  it("uses the route's own chain and tokens through the default dependencies", async () => {
    const { fakeEvm, restore } = installFakeEvm();
    try {
      fakeEvm.strictReceipts = true;
      const { route, state } = await rampState(RampDirection.SELL, "uniswapSwap");
      const reads: string[] = [];
      const { address, uniswapFee, uniswapPool } = ROBINHOOD_STOCKS.NVDA;
      let allowance = BigInt(route.amountInRaw);
      fakeEvm.onReadContract = (network, params) => {
        expect(network).toBe(Networks.Robinhood);
        reads.push(params.functionName);
        switch (params.functionName) {
          case "allowance":
            expect(params.address).toBe(address);
            expect(params.args).toEqual([ephemeral.address, ROBINHOOD_UNISWAP_SWAP_ROUTER_02]);
            return allowance;
          case "balanceOf":
            return BigInt(route.amountInRaw);
          case "paused":
          case "oraclePaused":
            return false;
          case "factory":
            return ROBINHOOD_UNISWAP_FACTORY;
          case "fee":
            return uniswapFee;
          case "getPool":
            return uniswapPool;
          case "token0":
            return ROBINHOOD_USDG_ADDRESS;
          case "token1":
            return address;
          default:
            return undefined;
        }
      };
      fakeEvm.onSimulateContract = () => [BigInt(route.softMinimumOutputRaw), [], [], 0n] as const;
      fakeEvm.onTransaction = () => {
        allowance = 0n;
      };

      expect(await run(UniswapSwapExecutor, state)).toBeNull();

      expect(fakeEvm.sentTransactions.map(tx => tx.network)).toEqual([Networks.Robinhood]);
      expect(reads).toContain("paused");
      expect(reads).toContain("getPool");
    } finally {
      restore();
    }
  });
});

describe("Polygon route keeps its behaviour", () => {
  const originalFindByPk = QuoteTicket.findByPk;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
  });

  async function polygonRamp() {
    const route = resolveUniswapRoute(
      { blocks: { uniswapV3FixedSwap: { inputAmountRaw: "100" } } },
      { blockState: { uniswapV3FixedSwap: { deadline: FUTURE_DEADLINE, hardMinimumOutputRaw: "95", softMinimumOutputRaw: "98" } } } as never,
      ephemeral.address
    );
    const swap = swapBlueprint(route);
    QuoteTicket.findByPk = mock(async () => ({
      metadata: { blocks: { uniswapV3FixedSwap: { inputAmountRaw: "100" } } }
    })) as typeof QuoteTicket.findByPk;
    return {
      route,
      state: {
        currentPhase: "uniswapSwap",
        errorLogs: [],
        get() {
          return this;
        },
        id: "ramp-polygon-1",
        phaseHistory: [],
        presignedTxs: [await sign(swap, 137)],
        quoteId: "quote-polygon-1",
        state: {
          blockState: { uniswapV3FixedSwap: { deadline: FUTURE_DEADLINE, hardMinimumOutputRaw: "95", softMinimumOutputRaw: "98" } },
          evmEphemeralAddress: ephemeral.address,
          flow: { id: "test-flow", version: 1 }
        },
        unsignedTxs: [swap],
        async update(update: Record<string, unknown>) {
          Object.assign(this, update);
          return this;
        }
      }
    };
  }

  function polygonDependencies(overrides: Partial<NonNullable<ConstructorParameters<typeof UniswapSwapExecutor>[0]>> = {}) {
    return {
      getAllowance: async () => 100n,
      getBalance: async () => 100n,
      getReceipt: async () => null,
      quote: async () => 99n,
      readStockFlags: mock(async () => ({ paused: true })),
      sendRawTransaction: async (transaction: `0x${string}`) => keccak256(transaction),
      simulateTransaction: async () => {},
      verifyDeployment: async () => {},
      waitForReceipt: async () => ({ status: "success" as const }),
      ...overrides
    };
  }

  it("never reads stock flags", async () => {
    const { state } = await polygonRamp();
    const deps = polygonDependencies({ getAllowance: mock(async () => 100n) });
    await new UniswapSwapExecutor(deps).execute(state as never).catch(() => null);
    expect(deps.readStockFlags).not.toHaveBeenCalled();
  });

  it("still fails the ramp on a read failure, which only stock routes retry", async () => {
    const { state } = await polygonRamp();
    const error = await new UniswapSwapExecutor(
      polygonDependencies({
        verifyDeployment: async () => {
          throw new Error("RPC unavailable");
        }
      })
    )
      .execute(state as never)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnrecoverablePhaseError);
  });

  it("still fails the ramp on a presigned transaction that does not match", async () => {
    const { state } = await polygonRamp();
    state.presignedTxs = [];
    const error = await new UniswapSwapExecutor(polygonDependencies()).execute(state as never).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnrecoverablePhaseError);
  });
});
