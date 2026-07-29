import { FiatToken, getPendulumDetails, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { defineContext, type SerializableBig } from "../../core/metadata";

export interface AveniaPendulumOfframpMetadata {
  payoutAmountDecimal: SerializableBig;
  payoutAmountRaw: string;
  pendulumCurrencyId: ReturnType<typeof getPendulumDetails>["currencyId"];
  transferAmountDecimal: SerializableBig;
  transferAmountRaw: string;
  transferNetwork: typeof Networks.Moonbeam;
}

export const AveniaPendulumOfframpContext = defineContext<AveniaPendulumOfframpMetadata>()("aveniaPendulumOfframp");

export async function simulateAveniaPendulumOfframp(
  input: import("../../core/types").PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
  ctx: import("../../core/types").PhaseCtx
) {
  const payoutAmount = input.amount.minus(ctx.fees?.displayFiat?.anchor ?? 0);
  return {
    metadata: {
      payoutAmountDecimal: payoutAmount,
      payoutAmountRaw: payoutAmount.times(100).toFixed(0, 0),
      pendulumCurrencyId: getPendulumDetails(FiatToken.BRL).currencyId,
      transferAmountDecimal: input.amount,
      transferAmountRaw: input.amountRaw,
      transferNetwork: Networks.Moonbeam
    },
    output: {
      amount: payoutAmount,
      amountRaw: payoutAmount.times(new Big(100)).toFixed(0, 0),
      chain: "fiat" as const,
      token: FiatToken.BRL
    }
  };
}
