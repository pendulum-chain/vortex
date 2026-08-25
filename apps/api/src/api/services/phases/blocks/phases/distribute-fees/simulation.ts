import { type EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
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
  network?: string;
  // ERC-20 the fee transfers move on an EVM distribution network. Absent on quotes
  // created before the network parameterization; the executor falls back to USDC.
  feeToken?: EvmToken;
  outputCurrencyId?: ReturnType<typeof import("@vortexfi/shared").getPendulumDetails>["currencyId"];
  outputDecimals?: number;
  vortexFeeUsd: string;
}

export const DistributeFeesContext = defineContext<DistributeFeesMetadata>()("distributeFees");

export interface SimulateDistributeFeesOptions {
  network: EvmNetworks;
  feeToken: EvmToken;
  deductFromAmount: boolean;
}

export async function simulateDistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx,
  options: SimulateDistributeFeesOptions = {
    deductFromAmount: true,
    feeToken: EvmToken.USDC,
    network: Networks.Base as EvmNetworks
  }
): Promise<PhaseResult<PhaseIO<Token, Chain>, DistributeFeesMetadata>> {
  if (!ctx.fees?.usd) {
    throw new Error("DistributeFees: Missing USD fees");
  }
  const totalFeesUsd = new Big(ctx.fees.usd.network).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup);
  const metadata: DistributeFeesMetadata = {
    anchorFeeUsd: ctx.fees.usd.anchor,
    feeToken: options.feeToken,
    network: options.network,
    networkFeeUsd: ctx.fees.usd.network,
    partnerMarkupUsd: ctx.fees.usd.partnerMarkup,
    totalFeesUsd: totalFeesUsd.toString(),
    vortexFeeUsd: ctx.fees.usd.vortex
  };

  if (!options.deductFromAmount) {
    // The corridor already deducted the platform fee from the flowing amount
    // elsewhere; this block only collects the reserved residual.
    return { metadata, output: input };
  }

  const newAmount = new Big(input.amount).minus(totalFeesUsd);
  if (newAmount.lt(0)) {
    ctx.addNote(`DistributeFees: fees ${totalFeesUsd.toFixed()} USD exceed amount ${input.amount.toFixed()}, setting to 0`);
    return {
      metadata,
      output: {
        ...evmIO(input.token, input.chain, new Big(0), "0"),
        requestInputAmountUsd: input.requestInputAmountUsd
      } as PhaseIO<Token, Chain>
    };
  }
  const newAmountRaw = newAmount.times(new Big(10).pow(SIMPLIFIED_TOKEN_DECIMALS)).toFixed(0, 0);
  ctx.addNote(
    `DistributeFees: ${input.amount.toFixed()} ${input.token} -> ${newAmount.toFixed()} ${input.token} after ${totalFeesUsd.toFixed()} USD fees`
  );
  return {
    metadata,
    output: {
      ...evmIO(input.token, input.chain, newAmount, newAmountRaw),
      requestInputAmountUsd: input.requestInputAmountUsd
    } as PhaseIO<Token, Chain>
  };
}
