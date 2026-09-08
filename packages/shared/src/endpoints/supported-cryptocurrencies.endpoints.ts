import { Networks } from "../helpers";
import { OnChainToken } from "../tokens/types/base";
import { RampDirection } from "../types/rampDirection";

export type SupportedCryptocurrency = OnChainToken;

export type SupportedCryptocurrencyDetails = SupportedEVMCryptocurrencyDetails | SupportedAssetHubCryptocurrencyDetails;

export interface SupportedEVMCryptocurrencyDetails extends SupportedCryptocurrencyDetailsBase {
  assetContractAddress: string;
}

export interface SupportedAssetHubCryptocurrencyDetails extends SupportedCryptocurrencyDetailsBase {
  assetForeignAssetId?: number;
}

export interface SupportedCryptocurrencyDetailsBase {
  assetSymbol: string;
  assetNetwork: Networks;
  assetDecimals: number;
  /// Ramp directions at least one corridor supports for this token on its network.
  rampTypes: RampDirection[];
}

export interface GetSupportedCryptocurrenciesRequest {
  network: Networks;
}

export interface GetSupportedCryptocurrenciesResponse {
  cryptocurrencies: SupportedCryptocurrencyDetails[];
}
