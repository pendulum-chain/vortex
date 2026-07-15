export type MoneriumCustomerType = "business" | "individual";
export type MoneriumKycStatus = "APPROVED" | "PENDING" | "REJECTED";

export interface MoneriumStatusResponse {
  customerType: MoneriumCustomerType;
  profileId: string;
  status: MoneriumKycStatus;
  statusExternal: string;
}

export type MoneriumOAuthCallback = { code: string; state: string } | { error: string; errorDescription?: string };

export interface MoneriumKycInput {
  callback?: MoneriumOAuthCallback;
  customerType: MoneriumCustomerType;
}

export interface MoneriumKycContext extends MoneriumKycInput {
  authorizationUrl?: string;
  error?: Error;
  profileId?: string;
  status?: MoneriumKycStatus;
  statusExternal?: string;
}

export type MoneriumKycOutput = MoneriumKycContext;

export class MoneriumAuthorizationRequiredError extends Error {
  constructor() {
    super("Monerium authorization is required");
    this.name = "MoneriumAuthorizationRequiredError";
  }
}
