import { PendulumCurrencyId, RampCurrency } from "./base";

export type PendulumTokenDetails = {
  erc20WrapperAddress: string;
  currencyId: PendulumCurrencyId;
  assetSymbol: string;
  decimals: number;
  currency: RampCurrency; // Used for price conversins
};
