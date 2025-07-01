export interface MoneriumAddress {
  address: string;
  profile: string;
  chains: string[];
}

export interface MoneriumResponse {
  addresses: MoneriumAddress[];
  total: number;
}

export interface FetchIbansParams {
  authToken: string;
}

export interface FetchProfileParams extends FetchIbansParams {
  profileId: string;
}

export interface IbanData {
  iban: string;
  bic: string;
  profile: string;
  address: string;
  chain: string;
}

export interface IbanDataResponse {
  ibans: IbanData[];
}

export interface MoneriumTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface MoneriumUserProfile {
  id: string;
  kind: string;
  name: string;
  state: string;
}

export interface BeneficiaryDetails {
  name: string;
  iban: string;
  bic: string;
}

export type AddressExistsResponse = MoneriumAddress;
