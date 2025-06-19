export interface MoneriumAddress {
  address: string;
  profile: string;
  chains: string[];
}

export interface MoneriumResponse {
  addresses: MoneriumAddress[];
  total: number;
}
