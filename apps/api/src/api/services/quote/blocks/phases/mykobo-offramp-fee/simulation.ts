import { EvmToken, FiatToken, RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { resolveMykoboWithdrawFee } from "../../../engines/mykobo-fee";
import { defineContext } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface MykoboOfframpFeeMetadata {
  anchorFeeEur: string;
  grossAmountEur: string;
}

export const MykoboOfframpFeeContext = defineContext<MykoboOfframpFeeMetadata>()("mykoboOfframpFee");

export async function simulateMykoboOfframpFee<Token extends TokenBrand, Chain extends ChainBrand>(
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<Token, Chain>, MykoboOfframpFeeMetadata>> {
  if (!ctx.fees?.usd || !ctx.fees.displayFiat) {
    throw new Error("MykoboOfframpFee: Missing fee snapshot");
  }
  const grossAmountEur = input.amount.toFixed(2, 0);
  const anchorFeeEur = await resolveMykoboWithdrawFee(grossAmountEur);
  const displayCurrency = ctx.fees.displayFiat.currency;
  const [anchorUsd, anchorDisplay] = await Promise.all([
    priceFeedService.convertCurrency(anchorFeeEur, FiatToken.EURC as RampCurrency, EvmToken.USDC as RampCurrency),
    priceFeedService.convertCurrency(anchorFeeEur, FiatToken.EURC as RampCurrency, displayCurrency)
  ]);
  const fees = {
    displayFiat: {
      ...ctx.fees.displayFiat,
      anchor: anchorDisplay,
      total: new Big(anchorDisplay)
        .plus(ctx.fees.displayFiat.network)
        .plus(ctx.fees.displayFiat.partnerMarkup)
        .plus(ctx.fees.displayFiat.vortex)
        .toFixed(2)
    },
    usd: {
      ...ctx.fees.usd,
      anchor: anchorUsd,
      total: new Big(anchorUsd).plus(ctx.fees.usd.network).plus(ctx.fees.usd.partnerMarkup).plus(ctx.fees.usd.vortex).toFixed(6)
    }
  };
  return {
    fees,
    metadata: { anchorFeeEur, grossAmountEur },
    output: input
  };
}
