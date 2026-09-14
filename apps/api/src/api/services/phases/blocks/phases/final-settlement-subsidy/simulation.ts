import { getOnChainTokenDetails, Networks, OnChainToken } from "@vortexfi/shared";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";
import { buildFullSubsidy, type SubsidyMetadata } from "../subsidize-pre/simulation";

export interface FinalSettlementSubsidyMetadata extends SubsidyMetadata {
  amountRaw: string;
  network: string;
  token: string;
}

export const FinalSettlementSubsidyContext = defineContext<FinalSettlementSubsidyMetadata>()("finalSettlementSubsidy");

export async function simulateFinalSettlementSubsidy<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, FinalSettlementSubsidyMetadata>> {
  const tokenDetails = getOnChainTokenDetails(input.chain as Networks, input.token as OnChainToken);
  if (!tokenDetails) {
    throw new Error(`FinalSettlementSubsidy: Missing token details for ${input.token} on ${input.chain}`);
  }
  // This phase records the quote-bound destination target for execution-time shortfall handling.
  // It is not a quote-time promotional subsidy calculation, so its metadata must not compare a
  // fiat-derived expected value with an arbitrary destination-token quantity.
  const subsidy = buildFullSubsidy(input.amount, input.amountRaw, input.amount, input.amountRaw, ctx);
  ctx.addNote(`FinalSettlementSubsidy: recorded destination target, amountRaw=${input.amountRaw}`);
  return {
    metadata: { ...subsidy, amountRaw: input.amountRaw, network: input.chain, token: input.token },
    output: input
  };
}
