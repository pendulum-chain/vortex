import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  EvmToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import {
  BASE_PANCAKE_V3_QUOTER_V2,
  BASE_PANCAKE_V3_ROUTER,
  BASE_PAXG_DECIMALS,
  BASE_PAXG_USDC_POOL,
  BASE_USDC_DECIMALS,
  GOLD_TOKEN,
  goldSwapPath,
  goldSwapTokens,
  readGoldReferencePrice
} from "../../core/gold-base";
import { evmIO } from "../../core/io";
import { defineContext } from "../../core/metadata";
import { assertStockPriceWithinGuard } from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { goldSettlementSubsidyCapUsd } from "../gold-settlement/simulation";
import { GOLD_SWAP_MAX_QUOTED_GAS } from "../uniswap-v3-fixed-swap/contract";
import { GOLD_SWAP_CONTEXT_KEY, type GoldSwapRouteMetadata } from "../uniswap-v3-fixed-swap/route";
import { quoteGoldSwap, verifyGoldSwapDeployment } from "../uniswap-v3-fixed-swap/simulation";

export interface GoldSwapMetadata {
  direction: RampDirection;
  reference: { deviationBps: number; priceUsd: string; updatedAt: string };
  swap: GoldSwapRouteMetadata;
}

export const GoldSwapContext = defineContext<GoldSwapMetadata>()(GOLD_SWAP_CONTEXT_KEY);

export interface GoldSwapSimulationDependencies {
  quoteSwap?: typeof quoteGoldSwap;
  readReference?: typeof readGoldReferencePrice;
  verifyDeployment?: typeof verifyGoldSwapDeployment;
}

const toDecimal = (raw: string | bigint, decimals: number) => new Big(raw.toString()).div(new Big(10).pow(decimals));

function assertInput(input: PhaseIO, token: string): void {
  if (input.chain !== Networks.Base || input.token !== token || BigInt(input.amountRaw) <= 0n) {
    throw new Error(`GoldSwap requires a positive ${token} amount on ${Networks.Base}`);
  }
}

function swapMetadata(
  direction: RampDirection,
  inputAmountRaw: string,
  outputAmountRaw: string,
  softMargin: Big.BigSource = AMM_MINIMUM_OUTPUT_SOFT_MARGIN
): GoldSwapRouteMetadata {
  const minimum = (margin: Big.BigSource) => new Big(outputAmountRaw).mul(new Big(1).minus(margin)).toFixed(0, 0);
  return {
    hardMinimumOutputRaw: minimum(AMM_MINIMUM_OUTPUT_HARD_MARGIN),
    inputAmountRaw,
    ...goldSwapTokens(direction),
    network: Networks.Base,
    outputAmountRaw,
    path: goldSwapPath(direction),
    pools: [BASE_PAXG_USDC_POOL],
    quoter: BASE_PANCAKE_V3_QUOTER_V2,
    router: BASE_PANCAKE_V3_ROUTER,
    routerKind: "v1",
    softMinimumOutputRaw: minimum(softMargin)
  };
}

/**
 * Quotes the pinned pool and refuses a price that is worse for the user than the Chainlink reference allows, the same
 * guard a stock swap passes. USDC counts as a dollar.
 */
async function quoteGuarded(
  direction: RampDirection,
  inputAmountRaw: string,
  ctx: PhaseCtx,
  dependencies: GoldSwapSimulationDependencies
): Promise<{ outputAmountRaw: bigint; paxg: Big; reference: GoldSwapMetadata["reference"]; usdc: Big }> {
  await (dependencies.verifyDeployment ?? verifyGoldSwapDeployment)();
  const outputAmountRaw = await (dependencies.quoteSwap ?? quoteGoldSwap)(
    direction,
    BigInt(inputAmountRaw),
    GOLD_SWAP_MAX_QUOTED_GAS
  );
  if (outputAmountRaw <= 0n) throw new Error(`GoldSwap: the pool returned nothing for ${inputAmountRaw}`);
  const isBuy = direction === RampDirection.BUY;
  const usdc = toDecimal(isBuy ? inputAmountRaw : outputAmountRaw, BASE_USDC_DECIMALS);
  const paxg = toDecimal(isBuy ? outputAmountRaw : inputAmountRaw, BASE_PAXG_DECIMALS);
  const reference = await (dependencies.readReference ?? readGoldReferencePrice)();
  const { deviationBps } = assertStockPriceWithinGuard({
    direction,
    executionPriceUsd: usdc.div(paxg),
    now: ctx.now,
    reference
  });
  return {
    outputAmountRaw,
    paxg,
    reference: { deviationBps, priceUsd: reference.priceUsd.toString(), updatedAt: reference.updatedAt.toISOString() },
    usdc
  };
}

export async function simulateGoldSwapBuy(
  input: PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  ctx: PhaseCtx,
  dependencies: GoldSwapSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>, GoldSwapMetadata>> {
  assertInput(input, EvmToken.USDC);
  const { outputAmountRaw, paxg, reference, usdc } = await quoteGuarded(RampDirection.BUY, input.amountRaw, ctx, dependencies);
  ctx.addNote(`GoldSwap: ${usdc.toFixed()} USDC -> ${paxg.toFixed()} ${GOLD_TOKEN}`);
  // The swap waits for a fill GoldSettlement can still top up within its cap, while the USDC can still be recovered.
  // A tenth of the cap is left for the pool fee and price impact of buying the shortfall.
  const settlementMargin = goldSettlementSubsidyCapUsd(usdc).div(usdc).mul(0.9);
  return {
    metadata: {
      direction: RampDirection.BUY,
      reference,
      swap: swapMetadata(
        RampDirection.BUY,
        input.amountRaw,
        outputAmountRaw.toString(),
        settlementMargin.lt(AMM_MINIMUM_OUTPUT_SOFT_MARGIN) ? settlementMargin : AMM_MINIMUM_OUTPUT_SOFT_MARGIN
      )
    },
    output: { ...evmIO(GOLD_TOKEN, Networks.Base, paxg, outputAmountRaw.toString()), requestInputAmountUsd: usdc }
  };
}

export async function simulateGoldSwapSell(
  input: PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>,
  ctx: PhaseCtx,
  dependencies: GoldSwapSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>, GoldSwapMetadata>> {
  assertInput(input, GOLD_TOKEN);
  const { outputAmountRaw, paxg, reference, usdc } = await quoteGuarded(RampDirection.SELL, input.amountRaw, ctx, dependencies);
  ctx.addNote(`GoldSwap: ${paxg.toFixed()} ${GOLD_TOKEN} -> ${usdc.toFixed()} USDC`);
  return {
    metadata: {
      direction: RampDirection.SELL,
      reference,
      swap: swapMetadata(RampDirection.SELL, input.amountRaw, outputAmountRaw.toString())
    },
    output: { ...evmIO(EvmToken.USDC, Networks.Base, usdc, outputAmountRaw.toString()), requestInputAmountUsd: usdc }
  };
}
