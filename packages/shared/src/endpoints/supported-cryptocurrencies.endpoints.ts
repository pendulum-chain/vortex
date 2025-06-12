import { Networks } from '../helpers';
import { OnChainTokenDetails } from '../tokens';
import { OnChainToken } from '../tokens/types/base';

export type SupportedCryptocurrency = OnChainToken;

export type SupportedCryptocurrencyDetails = SupportedEVMCryptocurrencyDetails | SupportedAssetHubCryptocurrencyDetails;

export interface SupportedEVMCryptocurrencyDetails extends SupportedCryptocurrencyDetailsBase {
  assetContractAddress: string;
}

export interface SupportedAssetHubCryptocurrencyDetails extends SupportedCryptocurrencyDetailsBase {
  assetForeignAssetId: number;
}

export interface SupportedCryptocurrencyDetailsBase {
  assetSymbol: string;
  assetNetwork: Networks;
  assetDecimals: number;
}

export interface GetSupportedCryptocurrenciesRequest {
  network?: Networks;
}

export interface GetSupportedCryptocurrenciesResponse {
  cryptocurrencies: SupportedCryptocurrencyDetails[];
}
