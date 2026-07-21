import Big from "big.js";
import { evmIO } from "../../core/io";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

const SIMPLIFIED_TOKEN_DECIMALS = 6;

export interface DistributeFeesMetadata {
  anchorFeeUsd: string;
  networkFeeUsd: string;
  partnerMarkupUsd: string;
  totalFeesUsd: string;
  vortexFeeUsd: string;
}

export const DistributeFeesContext = defineContext<DistributeFeesMetadata>()("distributeFees");

export async function simulateDistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, DistributeFeesMetadata>> {
  if (!ctx.fees?.usd) {
    throw new Error("DistributeFees: Missing USD fees");
  }
  const totalFeesUsd = new Big(ctx.fees.usd.network).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup);
  const newAmount = new Big(input.amount).minus(totalFeesUsd);
  if (newAmount.lt(0)) {
    ctx.addNote(`DistributeFees: fees ${totalFeesUsd.toFixed()} USD exceed amount ${input.amount.toFixed()}, setting to 0`);
    return {
      metadata: {
        anchorFeeUsd: ctx.fees.usd.anchor,
        networkFeeUsd: ctx.fees.usd.network,
        partnerMarkupUsd: ctx.fees.usd.partnerMarkup,
        totalFeesUsd: totalFeesUsd.toString(),
        vortexFeeUsd: ctx.fees.usd.vortex
      },
      output: evmIO(input.token, input.chain, new Big(0), "0") as PhaseIO<Token, Chain>
    };
  }
  const newAmountRaw = newAmount.times(new Big(10).pow(SIMPLIFIED_TOKEN_DECIMALS)).toFixed(0, 0);
  ctx.addNote(
    `DistributeFees: ${input.amount.toFixed()} ${input.token} -> ${newAmount.toFixed()} ${input.token} after ${totalFeesUsd.toFixed()} USD fees`
  );
  return {
    metadata: {
      anchorFeeUsd: ctx.fees.usd.anchor,
      networkFeeUsd: ctx.fees.usd.network,
      partnerMarkupUsd: ctx.fees.usd.partnerMarkup,
      totalFeesUsd: totalFeesUsd.toString(),
      vortexFeeUsd: ctx.fees.usd.vortex
    },
    output: evmIO(input.token, input.chain, newAmount, newAmountRaw) as PhaseIO<Token, Chain>
  };
}
