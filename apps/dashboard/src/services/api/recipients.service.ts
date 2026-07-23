import { apiClient } from "./api-client";

export type RecipientInviteeType = "individual" | "business";

/** A discount seeded into the invite by a discount_manager, in bps of the corridor rate. */
export interface SeededDiscountDto {
  rampType: "BUY" | "SELL";
  fiatCurrency: string;
  bps: number;
}

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
  /** Discount-carrying invites deep-link to the dashboard, so re-copy must know. */
  seededDiscounts: SeededDiscountDto[] | null;
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
  /** discount_manager only — bps discounts seeded into the accepting profile's pricing. */
  discounts?: { buyBps?: number; sellBps?: number };
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
  seededDiscounts: SeededDiscountDto[] | null;
  expiresAt: string;
  createdAt: string;
}

/** GET /v1/recipients/invite/:token — read-only gate-checked preview, consumes nothing. */
export interface InvitePreviewResponse {
  country: string;
  rail: string;
  payoutCurrency: string;
  inviteeType: RecipientInviteeType;
}

/** POST /v1/recipients/invite/:token/accept — links the authenticated profile to the sender. */
export interface AcceptedInviteResponse {
  id: string;
  invitation: {
    id: string;
    country: string;
    rail: string;
    payoutCurrency: string;
    inviteeType: RecipientInviteeType;
  };
  relationshipStatus: string;
}

export const RecipientsService = {
  /** Redeem an invite for the authenticated profile (idempotent for the accepting user). */
  acceptInvite(token: string): Promise<AcceptedInviteResponse> {
    return apiClient.post<AcceptedInviteResponse>(`/recipients/invite/${token}/accept`, {});
  },
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
  },
  /** Gate-checked invite preview for the confirm screen; leaves the invite untouched. */
  previewInvite(token: string): Promise<InvitePreviewResponse> {
    return apiClient.get<InvitePreviewResponse>(`/recipients/invite/${token}`);
  }
};
