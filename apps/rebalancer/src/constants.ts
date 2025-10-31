import { FiatToken, getAnyFiatTokenDetails, getAnyFiatTokenDetailsMoonbeam, PENDULUM_USDC_AXL } from "@vortexfi/shared";

export const usdcTokenDetails = PENDULUM_USDC_AXL;
export const brlaFiatTokenDetails = getAnyFiatTokenDetails(FiatToken.BRL);
export const brlaMoonbeamTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
