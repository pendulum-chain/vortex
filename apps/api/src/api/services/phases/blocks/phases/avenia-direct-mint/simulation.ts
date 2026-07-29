import { EvmToken, FiatToken, Networks, RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { calculateFees } from "../../core/fees";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { AveniaMintContext, type AveniaMintMetadata, simulateAveniaMint } from "../avenia-mint/simulation";

export { AveniaMintContext };

export async function simulateAveniaDirectMint(
  input: PhaseIO<typeof FiatToken.BRL, "fiat">,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>, AveniaMintMetadata>> {
  const result = await simulateAveniaMint(input, ctx);
  const anchorFee = new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString();

  return {
    ...result,
    fees: await calculateFees(ctx, {
      anchor: { amount: anchorFee, currency: FiatToken.BRL as RampCurrency },
      network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
    })
  };
}
