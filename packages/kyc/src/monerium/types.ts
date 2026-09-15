export type MoneriumCustomerType = "business" | "individual";
export type MoneriumKycStatus = "APPROVED" | "PENDING" | "REJECTED";

export type MoneriumOAuthClient = "dashboard" | "widget";

/** `rampError.code` reported by GET /v1/monerium/status when the backend's OAuth session is gone. */
export const MONERIUM_REAUTHENTICATION_REQUIRED = "MONERIUM_REAUTHENTICATION_REQUIRED";
export type MoneriumIbanReadiness = "provisioned" | "elsewhere" | "missing";

/** EUR onramp readiness of an approved profile, measured against the chain the onramp mints on. */
export interface MoneriumRampReadiness {
  chain: string;
  iban: MoneriumIbanReadiness;
  linkedAddress: string | null;
  source: "whitelabel" | "oauth";
}

export interface MoneriumStatusResponse {
  customerType: MoneriumCustomerType;
  profileId: string;
  status: MoneriumKycStatus;
  statusExternal: string;
  ramp?: MoneriumRampReadiness;
  /** Present instead of `ramp` when the live readiness read needs a renewed OAuth session. */
  rampError?: { code: string; message: string };
}

export interface MoneriumWalletLinkInput {
  address: string;
  chain: string;
  /** EOA signature over Monerium's fixed wallet-ownership message. */
  signature: string;
}

export interface MoneriumWalletLinkResult {
  address: string;
  chain: string;
  iban: "provisioned" | "pending" | "elsewhere";
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
  ramp?: MoneriumRampReadiness;
  rampError?: { code: string; message: string };
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
