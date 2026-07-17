import { apiClient } from "./api-client";

export type RecipientInviteeType = "individual" | "business";

/** The corridor slice echoed on both invitations and accepted relationships. */
export interface RecipientInvitationDto {
  id: string;
  country: string;
  rail: string;
  payoutCurrency: string;
  alias: string | null;
  inviteeEmail: string | null;
  inviteeType: RecipientInviteeType;
}

export interface RecipientPayoutReferenceDto {
  id: string;
  rail: string;
  currency: string;
  instrumentType: string;
  maskedDisplayLabel: string;
  status: string;
}

/** An accepted sender↔recipient relationship (GET /v1/recipients → recipients[]). */
export interface RecipientDto {
  id: string;
  createdAt: string;
  relationshipStatus: "invited" | "active" | "blocked" | "archived";
  onboardingStatus: "approved" | "pending" | "unknown";
  nickname: string | null;
  recipientType: RecipientInviteeType;
  invitation: RecipientInvitationDto | null;
  payoutReferences: RecipientPayoutReferenceDto[];
}

/** An invite that has not been accepted yet (GET /v1/recipients → pendingInvitations[]). */
export interface PendingInvitationDto {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  country: string;
  rail: string;
  payoutCurrency: string;
  alias: string | null;
  inviteeEmail: string | null;
  inviteeType: RecipientInviteeType;
  isExpired: boolean;
  /** Raw invite token for re-copy; null for legacy invites created before it was retained. */
  token: string | null;
}

export interface ListRecipientsResponse {
  recipients: RecipientDto[];
  pendingInvitations: PendingInvitationDto[];
}

export interface CreateInviteRequest {
  country: string;
  rail: string;
  payoutCurrency: string;
  alias: string;
  inviteeEmail?: string;
  inviteeType?: RecipientInviteeType;
}

/** The backend retains the raw `token` while the invite is pending, for re-copy from the list. */
export interface CreateInviteResponse {
  id: string;
  token: string;
  status: string;
  country: string;
  rail: string;
  payoutCurrency: string;
  alias: string | null;
  inviteeEmail: string | null;
  inviteeType: RecipientInviteeType;
  expiresAt: string;
  createdAt: string;
}

export const RecipientsService = {
  /** Hide a pending invitation from the list; the link stays redeemable. */
  archiveInvitation(id: string): Promise<{ id: string; archived: boolean }> {
    return apiClient.patch<{ id: string; archived: boolean }>(`/recipients/invitations/${id}`, { archived: true });
  },
  /** Archive an accepted relationship — removed from the list, recipient's KYC unaffected. */
  archiveRecipient(id: string): Promise<{ id: string; relationshipStatus: string }> {
    return apiClient.patch<{ id: string; relationshipStatus: string }>(`/recipients/${id}`, { status: "archived" });
  },
  createInvite(body: CreateInviteRequest): Promise<CreateInviteResponse> {
    return apiClient.post<CreateInviteResponse>("/recipients/invite", body);
  },
  list(): Promise<ListRecipientsResponse> {
    return apiClient.get<ListRecipientsResponse>("/recipients");
  }
};
