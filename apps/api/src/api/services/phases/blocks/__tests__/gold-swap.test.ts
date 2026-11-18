import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  EphemeralAccountType,
  EvmToken,
  type EvmTransactionData,
  Networks,
  type PresignedTx,
  QuoteError,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, encodePacked, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../../../config/vars";
import { type FakeEvm, installFakeEvm } from "../../../../../test-utils/fake-world/fake-evm";
import { ReconciliationRequiredPhaseError } from "../../../../errors/phase-error";
import { getEvmFundingAccount } from "../core/evm-funding";
import {
  BASE_PANCAKE_V3_FACTORY,
  BASE_PANCAKE_V3_QUOTER_V2,
  BASE_PANCAKE_V3_ROUTER,
  BASE_PAXG_ADDRESS,
  BASE_PAXG_USDC_POOL,
  BASE_USDC_ADDRESS,
  GOLD_TOKEN,
  goldSwapPath,
  goldSwapTokens
} from "../core/gold-base";
import { evmIO } from "../core/io";
import type { PhaseCtx, PrepareCtx } from "../core/types";
import { type GoldSwapMetadata, simulateGoldSwapBuy, simulateGoldSwapSell } from "../phases/gold-swap/simulation";
import { prepareGoldSwapTxs } from "../phases/gold-swap/transactions";
import { encodeUniswapSwap, GOLD_SWAP_MAX_QUOTED_GAS } from "../phases/uniswap-v3-fixed-swap/contract";
import { holdsOnFailure, resolveUniswapRoute } from "../phases/uniswap-v3-fixed-swap/route";
import { quoteGoldSwap, verifyGoldSwapDeployment } from "../phases/uniswap-v3-fixed-swap/simulation";
import { validateUniswapApproval, validateUniswapSwap } from "../phases/uniswap-v3-fixed-swap/validation";

const ephemeral = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OTHER = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-11-18T12:00:00Z");
const reference = { priceUsd: new Big(4000), updatedAt: new Date(NOW.getTime() - 60 * 60 * 1000) };
const ctx = () => ({ addNote: () => {}, notes: [], now: NOW }) as unknown as PhaseCtx;
const usdcIn = (amount: string) => evmIO(EvmToken.USDC, Networks.Base, new Big(amount), new Big(amount).mul(1e6).toFixed(0));
const paxgIn = (amount: string) => evmIO(GOLD_TOKEN, Networks.Base, new Big(amount), new Big(amount).mul(1e18).toFixed(0));
/** 100 USDC buys 0.025 PAXG at the reference price of 4000. */
const dependencies = (outputRaw: bigint) => ({
  quoteSwap: async () => outputRaw,
  readReference: async () => reference,
  verifyDeployment: async () => {}
});

describe("Gold swap simulation", () => {
  const { settlementSubsidyMaxBps, settlementSubsidyMaxUsd } = config.gold;
  afterEach(() => {
    config.gold.settlementSubsidyMaxBps = settlementSubsidyMaxBps;
    config.gold.settlementSubsidyMaxUsd = settlementSubsidyMaxUsd;
  });

  it("quotes a buy through the pinned pool and sizes its soft minimum from the settlement cap", async () => {
    const { metadata, output } = await simulateGoldSwapBuy(usdcIn("100"), ctx(), dependencies(25_000_000_000_000_000n));
    expect(output).toMatchObject({ amountRaw: "25000000000000000", chain: Networks.Base, token: GOLD_TOKEN });
    expect(output.amount.toString()).toBe("0.025");
    expect(output.requestInputAmountUsd?.toString()).toBe("100");
    expect(metadata.direction).toBe(RampDirection.BUY);
    expect(metadata.reference).toEqual({ deviationBps: 0, priceUsd: "4000", updatedAt: reference.updatedAt.toISOString() });
    expect(metadata.swap).toEqual({
      // 5% below the quote.
      hardMinimumOutputRaw: "23750000000000000",
      inputAmountRaw: "100000000",
      inputToken: BASE_USDC_ADDRESS,
      network: Networks.Base,
      outputAmountRaw: "25000000000000000",
      outputToken: BASE_PAXG_ADDRESS,
      path: goldSwapPath(RampDirection.BUY),
      pools: [BASE_PAXG_USDC_POOL],
      quoter: BASE_PANCAKE_V3_QUOTER_V2,
      router: BASE_PANCAKE_V3_ROUTER,
      routerKind: "v1",
      // The 5 USD floor covers far more than 2% of 100 USDC, so the swap's own 2% margin applies.
      softMinimumOutputRaw: "24500000000000000"
    });
  });

  it.each([
    // 1,000 USDC: the 5 USD floor is 0.5% of the trade, and nine tenths of it sizes the margin: 0.45%.
    ["1000", 250_000_000_000_000_000n, "248875000000000000"],
    // 10,000 USDC: 0.25% is 25 USD, so the margin is 0.225%.
    ["10000", 2_500_000_000_000_000_000n, "2494375000000000000"],
    // 100,000 USDC: the 50 USD ceiling is 0.05% of the trade, so the margin is 0.045%.
    ["100000", 25_000_000_000_000_000_000n, "24988750000000000000"]
  ])("narrows the soft minimum of a %s USDC buy to what its top-up cap covers", async (usdc, outputRaw, softMinimum) => {
    const { metadata } = await simulateGoldSwapBuy(usdcIn(usdc), ctx(), dependencies(outputRaw));
    expect(metadata.swap.softMinimumOutputRaw).toBe(softMinimum);
    expect(metadata.saleSubsidyMaxUsd).toBeUndefined();
  });

  it("never widens the soft minimum beyond the swap's own 2%, whatever the cap", async () => {
    config.gold.settlementSubsidyMaxBps = 1000;
    config.gold.settlementSubsidyMaxUsd = "500";
    const { metadata } = await simulateGoldSwapBuy(usdcIn("100"), ctx(), dependencies(25_000_000_000_000_000n));
    expect(metadata.swap.softMinimumOutputRaw).toBe("24500000000000000");
  });

  it("quotes a sell into USDC with the swap's own margins and records what topping it up may cost", async () => {
    const { metadata, output } = await simulateGoldSwapSell(paxgIn("0.025"), ctx(), dependencies(99_950_000n));
    expect(output).toMatchObject({ amountRaw: "99950000", chain: Networks.Base, token: "USDC" });
    expect(output.requestInputAmountUsd?.toString()).toBe("99.95");
    expect(metadata.direction).toBe(RampDirection.SELL);
    expect(metadata.saleSubsidyMaxUsd).toBe("5.000000");
    expect(metadata.swap).toMatchObject({
      hardMinimumOutputRaw: "94952500",
      inputAmountRaw: "25000000000000000",
      inputToken: BASE_PAXG_ADDRESS,
      outputToken: BASE_USDC_ADDRESS,
      path: goldSwapPath(RampDirection.SELL),
      softMinimumOutputRaw: "97951000"
    });
    // 3998 against the reference 4000 is 5 bps worse for the seller.
    expect(metadata.reference.deviationBps).toBe(5);
  });

  it("narrows the soft minimum of a large sale to what its top-up cap covers", async () => {
    // 2.5 PAXG for 9,995 USDC: 0.25% is 24.9875 USD, and nine tenths of it sizes the margin: 0.225%.
    const { metadata } = await simulateGoldSwapSell(paxgIn("2.5"), ctx(), dependencies(9_995_000_000n));
    expect(metadata.saleSubsidyMaxUsd).toBe("24.987500");
    expect(metadata.swap.softMinimumOutputRaw).toBe("9972511250");
    expect(metadata.swap.hardMinimumOutputRaw).toBe("9495250000");
  });

  it.each([
    // 100 USDC for 0.0244 PAXG is 4098 per ounce: 2.46% above the reference.
    ["a buy priced above the reference", () => simulateGoldSwapBuy(usdcIn("100"), ctx(), dependencies(24_400_000_000_000_000n))],
    // 0.025 PAXG for 97.5 USDC is 3900 per ounce: 2.5% below it.
    ["a sell priced below the reference", () => simulateGoldSwapSell(paxgIn("0.025"), ctx(), dependencies(97_500_000n))],
    [
      "a stale reference",
      () =>
        simulateGoldSwapBuy(usdcIn("100"), ctx(), {
          ...dependencies(25_000_000_000_000_000n),
          readReference: async () => ({ ...reference, updatedAt: new Date(NOW.getTime() - 73 * 60 * 60 * 1000) })
        })
    ]
  ])("refuses %s", async (_label, run) => {
    await expect(run()).rejects.toMatchObject({ isPublic: true, message: QuoteError.StockPriceUnavailable, status: 503 });
  });

  it("accepts a price that is better for the user than the reference", async () => {
    await expect(simulateGoldSwapBuy(usdcIn("100"), ctx(), dependencies(26_000_000_000_000_000n))).resolves.toBeDefined();
    await expect(simulateGoldSwapSell(paxgIn("0.025"), ctx(), dependencies(104_000_000n))).resolves.toBeDefined();
  });

  it.each([
    ["another chain", { ...usdcIn("100"), chain: Networks.Ethereum }],
    ["another token", { ...usdcIn("100"), token: "USDT" }],
    ["a zero amount", usdcIn("0")]
  ])("rejects a buy input on %s", async (_label, input) => {
    await expect(simulateGoldSwapBuy(input as never, ctx(), dependencies(1n))).rejects.toThrow("GoldSwap requires");
  });

  it("stops when the pool is not the pinned deployment or returns nothing", async () => {
    await expect(
      simulateGoldSwapBuy(usdcIn("100"), ctx(), {
        ...dependencies(1n),
        verifyDeployment: async () => {
          throw new Error("deployment does not match the pinned route");
        }
      })
    ).rejects.toThrow("pinned route");
    await expect(simulateGoldSwapBuy(usdcIn("100"), ctx(), dependencies(0n))).rejects.toThrow("returned nothing");
  });
});

function goldMetadata(direction: RampDirection): GoldSwapMetadata {
  const buy = direction === RampDirection.BUY;
  return {
    direction,
    reference: { deviationBps: 0, priceUsd: "4000", updatedAt: NOW.toISOString() },
    swap: {
      hardMinimumOutputRaw: buy ? "23750000000000000" : "94952500",
      inputAmountRaw: buy ? "100000000" : "25000000000000000",
      ...goldSwapTokens(direction),
      network: Networks.Base,
      outputAmountRaw: buy ? "25000000000000000" : "99950000",
      path: goldSwapPath(direction),
      pools: [BASE_PAXG_USDC_POOL],
      quoter: BASE_PANCAKE_V3_QUOTER_V2,
      router: BASE_PANCAKE_V3_ROUTER,
      routerKind: "v1",
      softMinimumOutputRaw: buy ? "24775000000000000" : "97951000"
    }
  };
}
const goldState = (swapDeadline = "1800000000") => ({ blockState: { goldSwap: { swapDeadline } } });
const resolved = (direction: RampDirection) =>
  resolveUniswapRoute({ blocks: { goldSwap: goldMetadata(direction) } }, goldState() as never, ephemeral.address);

describe("Gold route resolution", () => {
  it("orders the single-hop path from input to output through the 0.05% pool", () => {
    expect(goldSwapPath(RampDirection.BUY)).toBe(
      encodePacked(["address", "uint24", "address"], [BASE_USDC_ADDRESS, 500, BASE_PAXG_ADDRESS])
    );
    expect(goldSwapPath(RampDirection.SELL)).toBe(
      encodePacked(["address", "uint24", "address"], [BASE_PAXG_ADDRESS, 500, BASE_USDC_ADDRESS])
    );
  });

  it.each([
    [RampDirection.BUY, BASE_USDC_ADDRESS, BASE_PAXG_ADDRESS, "USDC", GOLD_TOKEN],
    [RampDirection.SELL, BASE_PAXG_ADDRESS, BASE_USDC_ADDRESS, GOLD_TOKEN, "USDC"]
  ])("reads a %s from blocks.goldSwap.swap, delivering to the signer", (direction, inputToken, outputToken, inputSymbol, outputSymbol) => {
    const route = resolved(direction);
    expect(route).toMatchObject({
      deadline: "1800000000",
      inputSymbol,
      inputToken,
      kind: "v1",
      network: Networks.Base,
      neverFails: true,
      outputSymbol,
      outputToken,
      path: goldSwapPath(direction),
      recipient: ephemeral.address,
      router: BASE_PANCAKE_V3_ROUTER,
      signer: ephemeral.address
    });
    expect(route.stock).toBeUndefined();
    // Like a stock route, a failure holds or pauses the ramp: the input is the user's own funds.
    expect(holdsOnFailure(route)).toBe(true);
  });

  it("leaves the Polygon route failing plainly", () => {
    const polygon = resolveUniswapRoute(
      { blocks: { uniswapV3FixedSwap: { inputAmountRaw: "100" } } },
      { blockState: { uniswapV3FixedSwap: { deadline: "55", hardMinimumOutputRaw: "95", softMinimumOutputRaw: "98" } } } as never,
      ephemeral.address
    );
    expect(holdsOnFailure(polygon)).toBe(false);
  });

  type Metadata = GoldSwapMetadata;
  const swapPatch = (patch: Partial<Metadata["swap"]>) => (metadata: Metadata) => ({
    ...metadata,
    swap: { ...metadata.swap, ...patch }
  });
  it.each<[string, (metadata: Metadata) => unknown]>([
    ["router", swapPatch({ router: OTHER })],
    ["quoter", swapPatch({ quoter: OTHER })],
    ["input token", swapPatch({ inputToken: OTHER })],
    ["output token", swapPatch({ outputToken: OTHER })],
    ["path", swapPatch({ path: goldSwapPath(RampDirection.SELL) })],
    ["pool", swapPatch({ pools: [OTHER] })],
    ["pool count", swapPatch({ pools: [BASE_PAXG_USDC_POOL, OTHER] })],
    ["network", swapPatch({ network: Networks.Robinhood as never })],
    ["router kind", swapPatch({ routerKind: "swapRouter02" as never })],
    ["zero input", swapPatch({ inputAmountRaw: "0" })],
    ["zero hard minimum", swapPatch({ hardMinimumOutputRaw: "0" })],
    ["soft minimum below hard", swapPatch({ softMinimumOutputRaw: "1" })],
    ["direction", metadata => ({ ...metadata, direction: "SIDEWAYS" })],
    ["direction flipped against the tokens", metadata => ({ ...metadata, direction: RampDirection.SELL })],
    ["missing swap", metadata => ({ ...metadata, swap: undefined })]
  ])("pauses instead of trusting metadata with a wrong %s", (_label, mutate) => {
    expect(() =>
      resolveUniswapRoute(
        { blocks: { goldSwap: mutate(goldMetadata(RampDirection.BUY)) } },
        goldState() as never,
        ephemeral.address
      )
    ).toThrow(ReconciliationRequiredPhaseError);
  });

  it("pauses without a usable deadline in the state", () => {
    for (const state of [goldState("0"), { blockState: {} }]) {
      expect(() =>
        resolveUniswapRoute({ blocks: { goldSwap: goldMetadata(RampDirection.BUY) } }, state as never, ephemeral.address)
      ).toThrow(ReconciliationRequiredPhaseError);
    }
  });
});

describe("Gold pool pins on chain", () => {
  let fakeEvm: FakeEvm;
  let restore: () => void;
  beforeEach(() => {
    ({ fakeEvm, restore } = installFakeEvm());
  });
  afterEach(() => {
    restore();
  });

  function scriptDeployment(patch: Record<string, unknown> = {}) {
    const [token0, token1] = [BASE_USDC_ADDRESS, BASE_PAXG_ADDRESS].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    fakeEvm.onReadContract = (network, params) => {
      expect(network).toBe(Networks.Base);
      const key = `${params.functionName}@${params.address.toLowerCase()}`;
      if (key in patch) return patch[key];
      if (params.functionName in patch) return patch[params.functionName];
      switch (params.functionName) {
        case "factory":
          return BASE_PANCAKE_V3_FACTORY;
        case "fee":
          return 500;
        case "getPool":
          expect(params.address).toBe(BASE_PANCAKE_V3_FACTORY);
          expect(params.args).toEqual([BASE_USDC_ADDRESS, BASE_PAXG_ADDRESS, 500]);
          return BASE_PAXG_USDC_POOL;
        case "token0":
          return token0;
        case "token1":
          return token1;
        default:
          return undefined;
      }
    };
  }

  it("accepts the pinned router, quoter and pool", async () => {
    scriptDeployment();
    await verifyGoldSwapDeployment();
  });

  it.each<[string, Record<string, unknown>]>([
    ["a pool with another token", { token1: OTHER }],
    ["a pool with another fee", { fee: 2500 }],
    ["a pool on another factory", { [`factory@${BASE_PAXG_USDC_POOL.toLowerCase()}`]: OTHER }],
    ["a pool the factory does not know", { getPool: OTHER }],
    ["a router on another factory", { [`factory@${BASE_PANCAKE_V3_ROUTER.toLowerCase()}`]: OTHER }],
    ["a quoter on another factory", { [`factory@${BASE_PANCAKE_V3_QUOTER_V2.toLowerCase()}`]: OTHER }]
  ])("rejects %s", async (_label, patch) => {
    scriptDeployment(patch);
    await expect(verifyGoldSwapDeployment()).rejects.toThrow("does not match the pinned route");
  });

  it("quotes through the pinned QuoterV2 and refuses a swap that needs too much gas", async () => {
    let gasEstimate = 115_247n;
    fakeEvm.onSimulateContract = (network, params) => {
      expect(network).toBe(Networks.Base);
      expect(params.address).toBe(BASE_PANCAKE_V3_QUOTER_V2);
      expect(params.functionName).toBe("quoteExactInput");
      expect(params.args).toEqual([goldSwapPath(RampDirection.BUY), 50_000_000n]);
      return [13_289_827_277_234_703n, [1n], [0], gasEstimate] as const;
    };
    expect(await quoteGoldSwap(RampDirection.BUY, 50_000_000n, GOLD_SWAP_MAX_QUOTED_GAS)).toBe(13_289_827_277_234_703n);
    gasEstimate = GOLD_SWAP_MAX_QUOTED_GAS + 1n;
    await expect(quoteGoldSwap(RampDirection.BUY, 50_000_000n, GOLD_SWAP_MAX_QUOTED_GAS)).rejects.toMatchObject({
      message: QuoteError.StockPriceUnavailable
    });
    // Execution reads the price without the bound.
    expect(await quoteGoldSwap(RampDirection.BUY, 50_000_000n)).toBe(13_289_827_277_234_703n);
  });
});

describe("Gold swap transactions", () => {
  const prepare = (direction: RampDirection) =>
    prepareGoldSwapTxs(
      {
        accounts: { [EphemeralAccountType.EVM]: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
        ownMetadata: goldMetadata(direction)
      } as unknown as PrepareCtx<GoldSwapMetadata>,
      { now: () => NOW.getTime(), probeFees: async () => ({ maxFeePerGas: 20_000_000n, maxPriorityFeePerGas: 1_000_000n }) }
    );
  const deadline = String(Math.floor(NOW.getTime() / 1000) + config.swap.deadlineMinutes * 60);
  const sign = async (intent: { network: Networks; phase: string; txData: unknown }, nonce: number): Promise<PresignedTx> => {
    const txData = intent.txData as EvmTransactionData;
    return {
      meta: {},
      network: intent.network,
      nonce,
      phase: intent.phase,
      signer: ephemeral.address,
      txData: await ephemeral.signTransaction({
        chainId: 8453,
        data: txData.data as `0x${string}`,
        gas: BigInt(txData.gas),
        maxFeePerGas: BigInt(txData.maxFeePerGas as string),
        maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas as string),
        nonce,
        to: txData.to as `0x${string}`,
        type: "eip1559",
        value: BigInt(txData.value)
      })
    } as PresignedTx;
  };

  it.each([RampDirection.BUY, RampDirection.SELL])("prepares a %s the swap executors accept for the same route", async direction => {
    const { intents, state } = await prepare(direction);
    expect(state).toEqual({ swapDeadline: deadline });
    expect(intents.map(intent => [intent.phase, intent.lane, intent.network, intent.signer])).toEqual([
      ["uniswapApprove", "main", Networks.Base, ephemeral.address],
      ["uniswapSwap", "main", Networks.Base, ephemeral.address],
      ["backupApprove", "backup", Networks.Base, ephemeral.address]
    ]);
    const route = resolveUniswapRoute(
      { blocks: { goldSwap: goldMetadata(direction) } },
      { blockState: { goldSwap: state } } as never,
      ephemeral.address
    );
    await expect(validateUniswapApproval(await sign(intents[0], 0), route)).resolves.toStartWith("0x");
    await expect(validateUniswapSwap(await sign(intents[1], 1), route)).resolves.toStartWith("0x");
  });

  it("approves exactly the input to the router and swaps it for at least the hard minimum, to the ephemeral", async () => {
    const { intents } = await prepare(RampDirection.BUY);
    const [approve, swap, backup] = intents.map(intent => intent.txData as EvmTransactionData);
    expect(approve.to).toBe(BASE_USDC_ADDRESS);
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data as `0x${string}` }).args).toEqual([
      BASE_PANCAKE_V3_ROUTER,
      100_000_000n
    ]);
    expect(swap.to).toBe(BASE_PANCAKE_V3_ROUTER);
    expect(swap.data).toBe(
      encodeUniswapSwap("v1", {
        amountIn: 100_000_000n,
        amountOutMinimum: 23_750_000_000_000_000n,
        deadline: BigInt(deadline),
        path: goldSwapPath(RampDirection.BUY),
        recipient: ephemeral.address
      })
    );
    expect([approve.value, swap.value, backup.value]).toEqual(["0", "0", "0"]);
    // 3x the probed fee at the signed gas limit, as every presigned EVM transaction is funded.
    expect(intents[0].prefundNativeValueRaw).toBe((100_000n * 20_000_000n * 3n).toString());
    expect(intents[1].prefundNativeValueRaw).toBe((500_000n * 20_000_000n * 3n).toString());
  });

  it("adds an operator-only recovery approval of the input, pinned to the first main nonce", async () => {
    for (const [direction, token, amount] of [
      [RampDirection.BUY, BASE_USDC_ADDRESS, 100_000_000n],
      [RampDirection.SELL, BASE_PAXG_ADDRESS, 25_000_000_000_000_000n]
    ] as const) {
      const backup = (await prepare(direction)).intents[2];
      expect(backup.reuseFirstMainNonce).toBe(true);
      const txData = backup.txData as EvmTransactionData;
      expect(txData.to).toBe(token);
      expect(decodeFunctionData({ abi: erc20Abi, data: txData.data as `0x${string}` })).toMatchObject({
        args: [getEvmFundingAccount(Networks.Base).address, amount],
        functionName: "approve"
      });
    }
  });
});
