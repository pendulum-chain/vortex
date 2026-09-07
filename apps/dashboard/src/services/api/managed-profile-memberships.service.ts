import { AuthService } from "../auth";
import { ApiError, apiClient, isApiError } from "./api-client";
import type { ManagedProfileMembershipRole } from "./managed-profiles.service";

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
  managedProfileId: string;
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
  managedProfile: { externalSubjectId: string; profileId: string };
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

export const ManagedProfileMembershipsService = {
  async accept(invitationId: string) {
    requireSession();
    return apiClient.post<{ managedProfileId: string; member: Omit<TeamMember, "email"> }>(
      `/managed-profile-member-invitations/${encodeURIComponent(invitationId)}/accept`
    );
  },
  async cancel(profileId: string, invitationId: string) {
    requireSession();
    return apiClient.delete<void>(
      `/managed-profiles/${encodeURIComponent(profileId)}/member-invitations/${encodeURIComponent(invitationId)}`
    );
  },
  async changeRole(profileId: string, memberProfileId: string, role: ManagedProfileMembershipRole) {
    requireSession();
    return apiClient.patch<{ member: Omit<TeamMember, "email"> }>(
      `/managed-profiles/${encodeURIComponent(profileId)}/members/${encodeURIComponent(memberProfileId)}`,
      { role }
    );
  },
  async events(profileId: string, cursor?: string, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ events: MemberEvent[]; pagination: { limit: number; nextCursor: string | null } }>(
      `/managed-profiles/${encodeURIComponent(profileId)}/member-events`,
      { params: { cursor, limit: 20 }, signal }
    );
  },
  async invitations(profileId: string, offset = 0, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ invitations: MemberInvitation[]; pagination: OffsetPagination }>(
      `/managed-profiles/${encodeURIComponent(profileId)}/member-invitations`,
      { params: { limit: 20, offset }, signal }
    );
  },
  async invite(profileId: string, input: { email: string; role: ManagedProfileMembershipRole }) {
    requireSession();
    return apiClient.post<{ invitation: MemberInvitation }>(
      `/managed-profiles/${encodeURIComponent(profileId)}/member-invitations`,
      input
    );
  },
  async members(profileId: string, offset = 0, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<{ members: TeamMember[]; pagination: OffsetPagination }>(
      `/managed-profiles/${encodeURIComponent(profileId)}/members`,
      { params: { limit: 20, offset }, signal }
    );
  },
  async preview(invitationId: string, signal?: AbortSignal) {
    requireSession();
    return apiClient.get<InvitationPreview>(`/managed-profile-member-invitations/${encodeURIComponent(invitationId)}`, {
      signal
    });
  },
  async remove(profileId: string, memberProfileId: string) {
    requireSession();
    return apiClient.delete<void>(
      `/managed-profiles/${encodeURIComponent(profileId)}/members/${encodeURIComponent(memberProfileId)}`
    );
  }
};
