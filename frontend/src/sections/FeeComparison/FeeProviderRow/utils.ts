import { PriceEndpoints } from 'shared';

export const MINIMUM_BRL_BUY_AMOUNT: Record<PriceEndpoints.Provider | 'vortex', number> = {
  transak: 7, // checked in the API response
  moonpay: 150, // checked in the API response
  alchemypay: 570, // checked in the API response
  vortex: 0.75,
};
