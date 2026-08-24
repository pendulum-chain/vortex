import { apiClient } from "./api-client";

/** Mirrors `VerificationStatus` in the API — raw enum values, used as summary keys. */
export type AdminVerificationStatus = "pending" | "started" | "in_review" | "approved" | "rejected";

export interface AdminCustomerEntity {
  id: string;
  type: "business" | "individual";
  status: string;
}

export interface AdminManagedProfile {
  contactEmail: string | null;
  customerType: "business" | "individual" | null;
  externalSubjectId: string;
  manager: {
    email: string | null;
    isActive: boolean;
    profileId: string;
  };
  status: "active" | "deleted";
}

export interface AdminAccountIdentity {
  id: string;
  email: string | null;
  kind: "authenticated" | "managed";
  managedProfile: AdminManagedProfile | null;
}

/** One row of GET /admin-console/accounts. */
export interface AdminAccountSummary extends AdminAccountIdentity {
  createdAt: string;
  entities: AdminCustomerEntity[];
  /** Provider-customer counts per verification status, across all of the account's entities. */
  verificationSummary: Record<AdminVerificationStatus, number>;
  activePartnerName: string | null;
}

export interface AdminAccountsPage {
  accounts: AdminAccountSummary[];
  limit: number;
  nextCursor: string | null;
  total: number;
}

export interface AdminKycCase {
  id: string;
  type: string;
  level: string | null;
  status: string;
  statusExternal: string | null;
  failureReasons: string[] | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export interface AdminProviderCustomer {
  id: string;
  provider: string;
  rail: string | null;
  status: AdminVerificationStatus;
  statusExternal: string | null;
  customerType: string;
  companyName: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  kycCase: AdminKycCase | null;
}

/** Detail nests provider customers under their entity, matching the onboarding endpoint. */
export interface AdminCustomerEntityDetail extends AdminCustomerEntity {
  country: string | null;
  providerCustomers: AdminProviderCustomer[];
}

export interface AdminSessionParty {
  id: string;
  email: string | null;
}

/** Sessions returned by the account-detail endpoint, all targeting that account. */
export interface AdminImpersonationSessionSummary {
  id: string;
  actor: AdminSessionParty;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  active: boolean;
}

/** The audit list additionally names the target, since it spans accounts. */
export interface AdminImpersonationSessionRecord extends AdminImpersonationSessionSummary {
  target: AdminSessionParty;
}

export interface AdminAccountDetail extends AdminAccountIdentity {
  createdAt: string;
  activeEntityId: string | null;
  entities: AdminCustomerEntityDetail[];
  impersonationSessions: AdminImpersonationSessionSummary[];
}

export interface ListAdminAccountsParams extends Record<string, string | number | boolean | undefined> {
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface StartImpersonationRequest {
  targetProfileId: string;
}

export interface StartImpersonationResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
  target: { id: string; email: string };
}

export interface ListImpersonationSessionsResponse {
  sessions: AdminImpersonationSessionRecord[];
}

export const AdminConsoleService = {
  endImpersonation: (sessionId: string) => apiClient.delete<void>(`/admin-console/impersonation/${sessionId}`),
  getAccount: (profileId: string, signal?: AbortSignal) =>
    apiClient.get<AdminAccountDetail>(`/admin-console/accounts/${profileId}`, { signal }),
  listAccounts: (params: ListAdminAccountsParams, signal?: AbortSignal) =>
    apiClient.get<AdminAccountsPage>("/admin-console/accounts", { params, signal }),
  listImpersonationSessions: (signal?: AbortSignal) =>
    apiClient.get<ListImpersonationSessionsResponse>("/admin-console/impersonation", { signal }),
  startImpersonation: (request: StartImpersonationRequest) =>
    apiClient.post<StartImpersonationResponse>("/admin-console/impersonation", request)
};
