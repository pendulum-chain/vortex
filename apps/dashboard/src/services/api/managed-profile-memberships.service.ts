import { AuthService } from "../auth";
import { ApiError, apiClient, isApiError } from "./api-client";
import type { ManagedProfileMembershipRole } from "./managed-profiles.service";

export interface Organization {
  ownerProfileId: string;
  ownerEmail: string | null;
  membership: { role: ManagedProfileMembershipRole; isOwner: boolean };
}

export interface TeamMember {
  createdAt: string;
  id: string;
  isOwner: boolean;
  memberProfileId: string;
  role: ManagedProfileMembershipRole;
  updatedAt: string;
  email: string | null;
}

export interface MemberInvitation {
  acceptedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  email: string;
  expiredAt: string | null;
  expiresAt: string;
  id: string;
  invitedByProfileId: string;
  ownerProfileId: string;
  role: ManagedProfileMembershipRole;
  status: "pending" | "accepted" | "cancelled" | "expired";
}

export interface MemberEvent {
  action:
    | "invited"
    | "invitation_cancelled"
    | "invitation_expired"
    | "invitation_accepted"
    | "member_added"
    | "role_changed"
    | "member_removed";
  actorProfileId: string | null;
  createdAt: string;
  id: string;
  invitationId: string | null;
  memberProfileId: string | null;
  previousRole: ManagedProfileMembershipRole | null;
  role: ManagedProfileMembershipRole | null;
}

export interface InvitationPreview {
  invitation: MemberInvitation;
  inviter: { email: string | null; profileId: string };
  organization: Pick<Organization, "ownerProfileId" | "ownerEmail">;
}

export interface OffsetPagination {
  limit: number;
  offset: number;
  total: number;
}

// Membership APIs are human-session-only, including reads. Never use a child secret
// or silently fall back to the operator's bearer while impersonating.
function requireSession(): void {
  if (!AuthService.getTokens() || AuthService.getAcceptedImpersonationSessionSnapshot()) {
    throw new ApiError(403, { code: "MANAGED_PROFILE_ACCESS_DENIED" }, "A personal login session is required.");
  }
}

export function shouldRetryMembershipQuery(failureCount: number, error: unknown): boolean {
  return !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export const OrganizationService = {
  async accept(invitationId: string) {
    requireSession();
    return apiClient.post<{ ownerProfileId: string; member: Omit<TeamMember, "email"> }>(
      `/organization-member-invitations/${encodeURIComponent(invitationId)}/accept`
    );
  },
  async cancel(expectedOwnerProfileId: string, invitationId: string) {
    requireSession();
    return apiClient.delete<void>(`/organization/member-invitations/${encodeURIComponent(invitationId)}`, {
      params: { expectedOwnerProfileId }
    });
  },
  async changeRole(expectedOwnerProfileId: string, memberProfileId: string, role: ManagedProfileMembershipRole) {
    requireSession();
    return apiClient.patch<{ member: Omit<TeamMember, "email"> }>(
      `/organization/members/${encodeURIComponent(memberProfileId)}`,
      { role },
      { params: { expectedOwnerProfileId } }
    );
  },
  async events(expectedOwnerProfileId: string, cursor?: string, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ events: MemberEvent[]; pagination: { limit: number; nextCursor: string | null } }>(
      "/organization/member-events",
      { params: { cursor, expectedOwnerProfileId, limit: 20 }, signal }
    );
  },
  async get(signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ organization: Organization | null }>("/organization", { signal });
  },
  async invitations(expectedOwnerProfileId: string, offset = 0, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ invitations: MemberInvitation[]; pagination: OffsetPagination }>(
      "/organization/member-invitations",
      { params: { expectedOwnerProfileId, limit: 20, offset }, signal }
    );
  },
  async invite(expectedOwnerProfileId: string, input: { email: string; role: ManagedProfileMembershipRole }) {
    requireSession();
    return apiClient.post<{ invitation: MemberInvitation }>("/organization/member-invitations", input, {
      params: { expectedOwnerProfileId }
    });
  },
  async members(expectedOwnerProfileId: string, offset = 0, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ members: TeamMember[]; pagination: OffsetPagination }>("/organization/members", {
      params: { expectedOwnerProfileId, limit: 20, offset },
      signal
    });
  },
  async preview(invitationId: string, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<InvitationPreview>(`/organization-member-invitations/${encodeURIComponent(invitationId)}`, {
      signal
    });
  },
  async remove(expectedOwnerProfileId: string, memberProfileId: string) {
    requireSession();
    return apiClient.delete<void>(`/organization/members/${encodeURIComponent(memberProfileId)}`, {
      params: { expectedOwnerProfileId }
    });
  }
};
