import type { MoneriumCustomerType, MoneriumStatusResponse } from "./types";

export interface MoneriumKycApi {
  completeOAuth(code: string, state: string): Promise<MoneriumStatusResponse>;
  getStatus(customerType: MoneriumCustomerType): Promise<MoneriumStatusResponse>;
  startOAuth(customerType: MoneriumCustomerType): Promise<{ authorizationUrl: string }>;
}

export interface MoneriumKycDeps {
  api: MoneriumKycApi;
  openAuthorizationUrl: (url: string) => void;
}
