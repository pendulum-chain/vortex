import type { CorridorId } from "@/domain/types";
import { apiClient } from "./api-client";

export type ManagedProfileCustomerType = "business" | "individual";

export interface ManagedProfileManager {
  allowedCorridors: CorridorId[];
  allowedCustomerTypes: ManagedProfileCustomerType[] | null;
  profileId: string;
}

export interface ManagedProfile {
  contactEmail: string | null;
  customerType: ManagedProfileCustomerType;
  externalSubjectId: string;
  profileId: string;
}

export interface ManagedProfilesResponse {
  manager: ManagedProfileManager;
  managedProfiles: ManagedProfile[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface ListManagedProfilesParams extends Record<string, string | number | boolean | undefined> {
  limit?: number;
  offset?: number;
}

export const ManagedProfilesService = {
  list(params: ListManagedProfilesParams = {}, signal?: AbortSignal): Promise<ManagedProfilesResponse> {
    return apiClient.get<ManagedProfilesResponse>("/managed-profiles", { params, signal });
  }
};
