import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { defineContext, SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface AveniaOfframpPayoutMetadata {
  payoutAmountDecimal: SerializableBig;
  payoutAmountRaw: string;
  transferAmountDecimal: SerializableBig;
  transferAmountRaw: string;
}

export const AveniaOfframpPayoutContext = defineContext<AveniaOfframpPayoutMetadata>()("aveniaOfframpPayout");

export async function simulateAveniaOfframpPayout(
  input: PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof FiatToken.BRL, "fiat">, AveniaOfframpPayoutMetadata>> {
  const anchorFee = new Big(ctx.fees?.displayFiat?.anchor ?? 0);
  const payoutAmount = input.amount.minus(anchorFee);
  const payoutAmountRaw = payoutAmount.times(100).toFixed(0, 0);
  return {
    metadata: {
      payoutAmountDecimal: payoutAmount,
      payoutAmountRaw,
      transferAmountDecimal: input.amount,
      transferAmountRaw: input.amountRaw
    },
    output: { amount: payoutAmount, amountRaw: payoutAmountRaw, chain: "fiat", token: FiatToken.BRL }
  };
}
