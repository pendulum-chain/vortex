import { PriceProvider } from "@packages/shared";

export const MINIMUM_BRL_BUY_AMOUNT: Record<PriceProvider | "vortex", number> = {
  alchemypay: 570, // checked in the API response
  moonpay: 150, // checked in the API response
  transak: 7, // checked in the API response
  vortex: 1
};
