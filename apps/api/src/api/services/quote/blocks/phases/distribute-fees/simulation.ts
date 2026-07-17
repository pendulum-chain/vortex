import Big from "big.js";
import { evmIO } from "../../core/io";
import type { ChainBrand, PhaseCtx, PhaseIO, TokenBrand } from "../../core/types";

const SIMPLIFIED_TOKEN_DECIMALS = 6;

export async function simulateDistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseIO<Token, Chain>> {
  if (!ctx.fees?.usd) {
    ctx.addNote("DistributeFees: no fees in ctx, skipping");
    return input;
  }
  const totalFeesUsd = new Big(ctx.fees.usd.network).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup);
  const newAmount = new Big(input.amount).minus(totalFeesUsd);
  if (newAmount.lt(0)) {
    ctx.addNote(`DistributeFees: fees ${totalFeesUsd.toFixed()} USD exceed amount ${input.amount.toFixed()}, setting to 0`);
    return evmIO(input.token, input.chain, new Big(0), "0", input.meta) as PhaseIO<Token, Chain>;
  }
  const newAmountRaw = newAmount.times(new Big(10).pow(SIMPLIFIED_TOKEN_DECIMALS)).toFixed(0, 0);
  ctx.addNote(
    `DistributeFees: ${input.amount.toFixed()} ${input.token} -> ${newAmount.toFixed()} ${input.token} after ${totalFeesUsd.toFixed()} USD fees`
  );
  return evmIO(input.token, input.chain, newAmount, newAmountRaw, input.meta) as PhaseIO<Token, Chain>;
}
