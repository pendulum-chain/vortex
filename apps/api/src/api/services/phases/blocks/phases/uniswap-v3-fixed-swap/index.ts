import { EvmToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { MONERIUM_EURE } from "../monerium-issue/simulation";
import { UniswapApproveExecutor, UniswapSwapExecutor } from "./execution";
import { simulateUniswapV3FixedSwap, UniswapV3FixedSwapContext } from "./simulation";
import { prepareUniswapV3FixedSwapTxs } from "./transactions";

export const PolygonEureUsdcUniswapSwap: Phase<
  typeof UniswapV3FixedSwapContext,
  PhaseIO<typeof MONERIUM_EURE, typeof Networks.Polygon>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Polygon>
> = {
  context: UniswapV3FixedSwapContext,
  executors: [new UniswapApproveExecutor(), new UniswapSwapExecutor()],
  name: "PolygonEureUsdcUniswapSwap",
  phases: ["uniswapApprove", "uniswapSwap"],
  prepareTxs: prepareUniswapV3FixedSwapTxs,
  simulate: simulateUniswapV3FixedSwap
};
