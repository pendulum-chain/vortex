import type { ChainBrand, Phase, PhaseIO, PrepareCtx, TokenBrand } from "../../core/types";
import { SquidRouterPayExecutor, SquidRouterSwapExecutor } from "./execution";
import {
  SquidRouterSwapContext,
  type SquidRouterSwapMetadata,
  simulateSquidRouterPassthrough,
  simulateSquidRouterSwap
} from "./simulation";
import { prepareSameChainSquidRouterSwapTxs, prepareSquidRouterSwapTxs } from "./transactions";

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

export function SquidRouterPassthrough<Token extends TokenBrand, Chain extends ChainBrand>(
  token: Token,
  chain: Chain
): Phase<typeof SquidRouterSwapContext, PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  return {
    context: SquidRouterSwapContext,
    executors: [new SquidRouterSwapExecutor()],
    name: `SquidRouterPassthrough(${chain}/${token})`,
    phases: ["squidRouterSwap"],
    simulate: (input, ctx) => simulateSquidRouterPassthrough(token, chain, input, ctx)
  };
}

export function SameChainSquidRouterSwap<Chain extends ChainBrand, FromToken extends TokenBrand, ToToken extends TokenBrand>(
  chain: Chain,
  fromToken: FromToken,
  toToken: ToToken
): Phase<typeof SquidRouterSwapContext, PhaseIO<FromToken, Chain>, PhaseIO<ToToken, Chain>> {
  return {
    context: SquidRouterSwapContext,
    executors: [new SquidRouterSwapExecutor()],
    name: `SameChainSquidRouterSwap(${chain}/${fromToken}->${toToken})`,
    phases: ["squidRouterSwap"],
    prepareTxs: (ctx: PrepareCtx<SquidRouterSwapMetadata>) =>
      prepareSameChainSquidRouterSwapTxs(chain, chain, fromToken, toToken, ctx),
    simulate: (input, ctx) => simulateSquidRouterSwap(chain, chain, fromToken, toToken, input, ctx)
  };
}
