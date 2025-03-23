import { StellarTokenDetails } from '../constants/tokenConfig';

export interface TomlValues {
  signingKey?: string;
  webAuthEndpoint?: string;
  sep24Url?: string;
  sep6Url?: string;
  kycServer?: string;
}

export interface ISep24Intermediate {
  url: string;
  id: string;
}

export interface IAnchorSessionParams {
  token: string;
  tomlValues: TomlValues;
  tokenConfig: StellarTokenDetails;
  offrampAmount: string;
}

export interface SepResult {
  amount: string;
  memo: string;
  memoType: string;
  offrampingAccount: string;
}
