export const MONERIUM_PROFILE_STATES = ["created", "incomplete", "pending", "approved", "rejected"] as const;
export type MoneriumProfileState = (typeof MONERIUM_PROFILE_STATES)[number];

export const MONERIUM_PROFILE_KINDS = ["personal", "corporate"] as const;
export type MoneriumProfileKind = (typeof MONERIUM_PROFILE_KINDS)[number];

export const MONERIUM_SECTION_STATES = ["incomplete", "pending", "approved", "rejected"] as const;
export type MoneriumSectionState = (typeof MONERIUM_SECTION_STATES)[number];

export const MONERIUM_VERIFICATION_KINDS = [
  "idDocument",
  "facialSimilarity",
  "proofOfResidency",
  "sourceOfFunds",
  "corporateName",
  "corporateAddress",
  "registrationNumber",
  "dateOfRegistration",
  "beneficialOwnership",
  "powerOfAttorney"
] as const;
export type MoneriumVerificationKind = (typeof MONERIUM_VERIFICATION_KINDS)[number];

export const MONERIUM_CHAINS = [
  "ethereum",
  "gnosis",
  "polygon",
  "arbitrum",
  "linea",
  "base",
  "noble",
  "sepolia",
  "chiado",
  "amoy",
  "arbitrumsepolia",
  "lineasepolia",
  "basesepolia",
  "grand"
] as const;
export type MoneriumChain = (typeof MONERIUM_CHAINS)[number];

export const MONERIUM_TOKEN_CHAINS = [...MONERIUM_CHAINS, "scrollsepolia"] as const;
export type MoneriumTokenChain = (typeof MONERIUM_TOKEN_CHAINS)[number];

export const MONERIUM_ORDER_STATES = ["placed", "pending", "processed", "rejected"] as const;
export type MoneriumOrderState = (typeof MONERIUM_ORDER_STATES)[number];

export const MONERIUM_ORDER_FILTER_STATES = ["pending", "processed", "rejected"] as const;
export type MoneriumOrderFilterState = (typeof MONERIUM_ORDER_FILTER_STATES)[number];

export const MONERIUM_WEBHOOK_TYPES = [
  "iban.updated",
  "order.created",
  "order.updated",
  "profile.error",
  "profile.updated"
] as const;
export type MoneriumWebhookType = (typeof MONERIUM_WEBHOOK_TYPES)[number];

export const MONERIUM_ADDRESS_OWNERSHIP_MESSAGE = "I hereby declare that I am the address owner.";

export interface MoneriumAccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

export interface MoneriumProfileSummary {
  id: string;
  kind: MoneriumProfileKind;
  name: string;
  state: MoneriumProfileState;
}

export interface MoneriumProfile extends MoneriumProfileSummary {
  details: { state: MoneriumSectionState };
  form: { state: MoneriumSectionState };
  verifications: Array<{ kind: MoneriumVerificationKind; state: MoneriumSectionState }>;
}

export interface MoneriumListProfilesResponse {
  profiles: MoneriumProfileSummary[];
}

export interface MoneriumAddress {
  address: string;
  chains: MoneriumChain[];
  profile: string;
}

export interface MoneriumListAddressesResponse {
  addresses: MoneriumAddress[];
}

export interface MoneriumLinkAddressRequest {
  address: string;
  chain: MoneriumChain;
  message: typeof MONERIUM_ADDRESS_OWNERSHIP_MESSAGE;
  profile: string;
  /** EOA signature, combined off-chain EIP-1271 signature bytes, or `0x` for on-chain EIP-1271 approval. */
  signature: string;
}

export interface MoneriumAcceptedResponse {
  code: 202;
  status: "Accepted";
}

export type MoneriumLinkAddressResult = { httpStatus: 201 } | ({ httpStatus: 202 } & MoneriumAcceptedResponse);

export interface MoneriumIban {
  address: string;
  bic: string;
  chain: MoneriumChain;
  iban: string;
  name: string;
  profile: string;
}

export interface MoneriumIbanUpdatedData {
  address: string;
  bic?: string;
  chain: MoneriumChain;
  iban: string;
  name?: string;
  profile: string;
  state?: string;
}

export interface MoneriumListIbansResponse {
  ibans: MoneriumIban[];
}

export interface MoneriumIbanDestinationRequest {
  address: string;
  chain: MoneriumChain;
}

export type MoneriumRequestIbanResult = { httpStatus: 202 | 304 };

export interface MoneriumIbanIdentifier {
  iban: string;
  standard: "iban";
}

export interface MoneriumChainIdentifier {
  address: string;
  chain: MoneriumChain;
  standard: "chain";
}

export interface MoneriumPersonalCounterpartDetails {
  country: string;
  firstName: string;
  lastName: string;
}

export interface MoneriumCorporateCounterpartDetails {
  companyName: string;
  country: string;
}

export interface MoneriumRedeemOrderRequest {
  address: string;
  amount: string;
  chain: MoneriumChain;
  counterpart: {
    details: MoneriumPersonalCounterpartDetails | MoneriumCorporateCounterpartDetails;
    identifier: MoneriumIbanIdentifier;
  };
  currency: "eur";
  id?: string;
  kind: "redeem";
  memo?: string;
  message: string;
  referenceNumber?: string;
  signature: string;
  supportingDocumentId?: string;
}

export interface MoneriumOrder {
  address: string;
  amount: string;
  chain: MoneriumChain;
  counterpart: {
    details?: Record<string, unknown>;
    identifier: MoneriumIbanIdentifier | MoneriumChainIdentifier | ({ standard: string } & Record<string, unknown>);
  };
  currency: "eur" | "usd" | "gbp" | "isk";
  id: string;
  kind: "issue" | "redeem";
  memo: string;
  meta: {
    placedAt: string;
    processedAt?: string;
    rejectedReason?: string;
    supportingDocumentId?: string;
    txHashes?: string[];
  };
  profile: string;
  referenceNumber?: string;
  state: MoneriumOrderState;
}

export interface MoneriumListOrdersResponse {
  orders: MoneriumOrder[];
}

export type MoneriumCreateOrderResult =
  | { httpStatus: 200; order: MoneriumOrder }
  | ({ httpStatus: 202 } & MoneriumAcceptedResponse);

export interface MoneriumUploadedFile {
  hash: string;
  id: string;
  meta: {
    createdAt: string;
    updatedAt: string;
    uploadedBy: string;
  };
  name: string;
  size: number;
  type: string;
}

export interface MoneriumCreateWebhookRequest {
  secret: string;
  types?: MoneriumWebhookType[];
  url: string;
}

export interface MoneriumWebhookSubscription {
  id: string;
  state: "active" | "inactive";
  types: MoneriumWebhookType[];
  url: string;
}

export interface MoneriumListWebhooksResponse {
  subscriptions: MoneriumWebhookSubscription[];
}

export interface MoneriumUpdateWebhookRequest {
  state?: "active" | "inactive";
  types?: MoneriumWebhookType[];
}

export type MoneriumWebhookEvent =
  | { timestamp: string; type: "subscription.created" }
  | { data: MoneriumOrder; timestamp: string; type: "order.created" | "order.updated" }
  | {
      data: Pick<MoneriumProfile, "id" | "kind" | "state">;
      timestamp: string;
      type: "profile.updated";
    }
  | {
      data: {
        errors: Array<{ field: string; reason: string }>;
        id: string;
        kind: MoneriumProfileKind;
      };
      timestamp: string;
      type: "profile.error";
    }
  | { data: MoneriumIbanUpdatedData; timestamp: string; type: "iban.updated" };
