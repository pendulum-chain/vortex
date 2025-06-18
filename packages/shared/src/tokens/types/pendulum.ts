import { PendulumCurrencyId } from "./base";

export type PendulumTokenDetails = {
  pendulumErc20WrapperAddress: string;
  pendulumCurrencyId: PendulumCurrencyId;
  pendulumAssetSymbol: string;
  pendulumDecimals: number;
};
