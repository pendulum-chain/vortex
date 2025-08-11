export enum MoneriumAddressStatus {
  REQUESTED = "requested",
  APPROVED = "approved"
}

export interface MoneriumAddress {
  address: string;
  profile: string;
  chains: string[];
  status: MoneriumAddressStatus;
}

export interface MoneriumResponse {
  addresses: MoneriumAddress[];
  total: number;
}

export interface FetchIbansParams {
  authToken: string;
  profileId: string;
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
  amount: string;
}

export type AddressExistsResponse = MoneriumAddress;

export interface AuthContextProfile {
  id: string;
  name: string;
  state: string;
  kind: string;
}

export interface AuthContext {
  defaultProfile: string;
  profiles: AuthContextProfile[];
}

export enum MoneriumErrors {
  USER_MINT_ADDRESS_NOT_FOUND = "User mint address not found",
  USER_MINT_ADDRESS_IS_NOT_READY = "User mint address is not ready yet"
}
