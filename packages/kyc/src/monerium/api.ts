import type {
  MoneriumCustomerType,
  MoneriumOAuthClient,
  MoneriumStatusResponse,
  MoneriumWalletLinkInput,
  MoneriumWalletLinkResult
} from "./types";

export interface MoneriumKycApi {
  completeOAuth(code: string, state: string): Promise<MoneriumStatusResponse>;
  getStatus(customerType: MoneriumCustomerType): Promise<MoneriumStatusResponse>;
  startOAuth(customerType: MoneriumCustomerType, client?: MoneriumOAuthClient): Promise<{ authorizationUrl: string }>;
}

/** Wallet and IBAN readiness operations for an approved profile (POST /v1/monerium/wallet, /iban/move). */
export interface MoneriumWalletApi {
  linkWallet(input: MoneriumWalletLinkInput): Promise<MoneriumWalletLinkResult>;
  moveIban(input: { address: string; chain: string; customerType?: MoneriumCustomerType }): Promise<MoneriumWalletLinkResult>;
}

export interface MoneriumKycDeps {
  api: MoneriumKycApi;
  /** Which registered callback the backend binds; defaults to the dashboard callback. */
  client?: MoneriumOAuthClient;
  openAuthorizationUrl: (url: string) => void;
  /** The host reports unexpected actor failures through its own error monitor. */
  reportError?: (error: Error) => void;
}
