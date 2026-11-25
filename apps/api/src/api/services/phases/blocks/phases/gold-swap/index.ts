import type { EvmToken, Networks } from "@vortexfi/shared";
import type { GOLD_TOKEN } from "../../core/gold-base";
import type { Phase, PhaseIO } from "../../core/types";
import { UniswapApproveExecutor, UniswapSwapExecutor } from "../uniswap-v3-fixed-swap/execution";
import { GoldSwapContext, simulateGoldSwapBuy, simulateGoldSwapSell } from "./simulation";
import { prepareGoldSwapTxs } from "./transactions";

type BaseUsdc = PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>;
type BasePaxg = PhaseIO<typeof GOLD_TOKEN, typeof Networks.Base>;

/** USDC to PAXG through the pinned pool on Base. GoldSettlement makes up what the fill leaves short of the quote. */
export function GoldSwapBuy(): Phase<typeof GoldSwapContext, BaseUsdc, BasePaxg> {
  return {
    context: GoldSwapContext,
    executors: [new UniswapApproveExecutor(), new UniswapSwapExecutor()],
    name: "GoldSwapBuy",
    phases: ["uniswapApprove", "uniswapSwap"],
    prepareTxs: ctx => prepareGoldSwapTxs(ctx),
    simulate: (input, ctx) => simulateGoldSwapBuy(input, ctx)
  };
}

/** PAXG to USDC through the pinned pool on Base. */
export function GoldSwapSell(): Phase<typeof GoldSwapContext, BasePaxg, BaseUsdc> {
  return {
    context: GoldSwapContext,
    executors: [new UniswapApproveExecutor(), new UniswapSwapExecutor()],
    name: "GoldSwapSell",
    phases: ["uniswapApprove", "uniswapSwap"],
    prepareTxs: ctx => prepareGoldSwapTxs(ctx),
    simulate: (input, ctx) => simulateGoldSwapSell(input, ctx)
  };
}
