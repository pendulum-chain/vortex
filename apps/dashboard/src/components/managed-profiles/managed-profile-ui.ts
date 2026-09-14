import type { ManagedProfile } from "@/services/api/managed-profiles.service";
import type { ManagedProfileSelection } from "@/services/auth";

export const CHILD_FORBIDDEN_PATHS = ["/api-keys", "/settings", "/admin", "/managed-profiles"] as const;

export function isChildModePathForbidden(pathname: string): boolean {
  return CHILD_FORBIDDEN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function toManagedProfileSelection(profile: ManagedProfile): Omit<ManagedProfileSelection, "managerProfileId"> {
  return {
    customerType: profile.customerType,
    externalSubjectId: profile.externalSubjectId,
    targetEmail: profile.contactEmail ?? profile.externalSubjectId,
    targetProfileId: profile.profileId
  };
}
