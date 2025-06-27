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
