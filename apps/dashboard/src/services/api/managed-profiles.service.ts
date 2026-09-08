import type { CorridorId } from "@/domain/types";
import { apiClient } from "./api-client";

export type ManagedProfileCustomerType = "business" | "individual";
export type ManagedProfileMembershipRole = "manager" | "read_only";

export interface ManagedProfileActor {
  canProvisionManagedProfiles: boolean;
  hasMemberships: boolean;
  profileId: string;
}

export interface ManagedProfilePolicy {
  allowedCorridors: CorridorId[];
  allowedCustomerTypes: ManagedProfileCustomerType[] | null;
}

export interface ManagedProfileMembership {
  isOwner: boolean;
  role: ManagedProfileMembershipRole;
}

export interface ManagedProfile {
  contactEmail: string | null;
  customerType: ManagedProfileCustomerType;
  externalSubjectId: string;
  membership: ManagedProfileMembership;
  policy: ManagedProfilePolicy;
  profileId: string;
  status: "active" | "deleted";
}

export interface ManagedProfilesResponse {
  actor: ManagedProfileActor;
  managedProfiles: ManagedProfile[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface ManagedProfileResponse {
  actor: ManagedProfileActor;
  managedProfile: ManagedProfile;
}

export interface ListManagedProfilesParams extends Record<string, string | number | boolean | undefined> {
  limit?: number;
  offset?: number;
}

export const ManagedProfilesService = {
  get(profileId: string, options: { bootstrap?: boolean; signal?: AbortSignal } = {}): Promise<ManagedProfileResponse> {
    // The API reserves membership-invalid errors for selected-child bootstrap intent.
    return apiClient.get<ManagedProfileResponse>(`/managed-profiles/${profileId}`, {
      managedProfile: options.bootstrap === true,
      signal: options.signal
    });
  },
  list(params: ListManagedProfilesParams = {}, signal?: AbortSignal): Promise<ManagedProfilesResponse> {
    return apiClient.get<ManagedProfilesResponse>("/managed-profiles", { params, signal });
  }
};
