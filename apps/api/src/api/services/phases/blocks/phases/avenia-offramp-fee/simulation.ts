import { BrlaApiService, EvmToken, FiatToken, RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { calculateFees } from "../../core/fees";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface AveniaOfframpFeeMetadata {
  anchorFeeBrl: string;
  grossAmountBrl: string;
}

export const AveniaOfframpFeeContext = defineContext<AveniaOfframpFeeMetadata>()("aveniaOfframpFee");

export async function simulateAveniaOfframpFee<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, AveniaOfframpFeeMetadata>> {
  const grossAmountBrl = input.amount.toFixed(2, 0);
  const quote = await BrlaApiService.getInstance().createPayOutQuote(
    { outputAmount: grossAmountBrl, outputThirdParty: false },
    { useCache: true }
  );
  const anchorFeeBrl = new Big(quote.inputAmount).minus(quote.outputAmount).toString();
  const fees = await calculateFees(ctx, {
    anchor: { amount: anchorFeeBrl, currency: FiatToken.BRL as RampCurrency },
    network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
  });
  return {
    fees,
    metadata: { anchorFeeBrl, grossAmountBrl },
    output: input
  };
}
