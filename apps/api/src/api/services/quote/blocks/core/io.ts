import type { RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "./types";

export function requestToIO(ctx: PhaseCtx): PhaseIO<RampCurrency, "fiat"> {
  return {
    amount: new Big(ctx.request.inputAmount),
    amountRaw: ctx.request.inputAmount,
    chain: "fiat",
    meta: {},
    token: ctx.request.inputCurrency
  };
}

export function evmIO<Token extends TokenBrand, Chain extends ChainBrand>(
  token: Token,
  chain: Chain,
  amount: Big,
  amountRaw: string,
  meta?: Record<string, unknown>
): PhaseIO<Token, Chain> {
  return { amount, amountRaw, chain, meta: meta ?? {}, token };
}
