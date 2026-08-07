import { EvmToken, FiatToken, multiplyByPowerOfTen, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export interface MykoboOfframpPayoutMetadata {
  payoutAmountDecimal: SerializableBig;
  payoutAmountRaw: string;
  transferAmountDecimal: SerializableBig;
  transferAmountRaw: string;
}

export const MykoboOfframpPayoutContext = defineContext<MykoboOfframpPayoutMetadata>()("mykoboOfframpPayout");

export async function simulateMykoboOfframpPayout(
  input: PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<typeof FiatToken.EURC, "fiat">, MykoboOfframpPayoutMetadata>> {
  const transferAmount = new Big(input.amount.toFixed(2, 0));
  const transferAmountRaw = multiplyByPowerOfTen(transferAmount, 6).toFixed(0, 0);
  const payoutAmount = transferAmount.minus(ctx.fees?.displayFiat?.anchor ?? 0);
  const payoutAmountRaw = multiplyByPowerOfTen(payoutAmount, 2).toFixed(0, 0);
  return {
    metadata: {
      payoutAmountDecimal: payoutAmount,
      payoutAmountRaw,
      transferAmountDecimal: transferAmount,
      transferAmountRaw
    },
    output: { amount: payoutAmount, amountRaw: payoutAmountRaw, chain: "fiat", token: FiatToken.EURC }
  };
}
