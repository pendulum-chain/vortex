import type { ChainBrand, Phase, PhaseIO, PrepareCtx, TokenBrand } from "../../core/types";
import { SquidRouterPayExecutor, SquidRouterSwapExecutor } from "./execution";
import { SquidRouterSwapContext, type SquidRouterSwapMetadata, simulateSquidRouterSwap } from "./simulation";
import { prepareSquidRouterSwapTxs } from "./transactions";

export function SquidRouterSwap<
  FromChain extends ChainBrand,
  ToChain extends ChainBrand,
  FromToken extends TokenBrand,
  ToToken extends TokenBrand
>(
  fromChain: FromChain,
  toChain: ToChain,
  fromToken: FromToken,
  toToken: ToToken
): Phase<typeof SquidRouterSwapContext, PhaseIO<FromToken, FromChain>, PhaseIO<ToToken, ToChain>> {
  return {
    context: SquidRouterSwapContext,
    executors: [new SquidRouterSwapExecutor(), new SquidRouterPayExecutor()],
    name: `SquidRouterSwap(${fromChain}/${fromToken}->${toChain}/${toToken})`,
    phases: ["squidRouterSwap", "squidRouterPay"],
    prepareTxs: (ctx: PrepareCtx<SquidRouterSwapMetadata>) =>
      prepareSquidRouterSwapTxs(fromChain, toChain, fromToken, toToken, ctx),
    simulate: (input, ctx) => simulateSquidRouterSwap(fromChain, toChain, fromToken, toToken, input, ctx)
  };
}
