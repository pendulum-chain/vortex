import type { ManagedProfile, ManagedProfileActor } from "@/services/api/managed-profiles.service";
import type { ManagedProfileSelection } from "@/services/auth";

export const CHILD_FORBIDDEN_PATHS = ["/settings", "/admin", "/managed-profiles", "/transfer", "/team"] as const;

export function canAccessManagedProfiles(actor: ManagedProfileActor | undefined): boolean {
  return actor?.canProvisionManagedProfiles === true || actor?.hasMemberships === true;
}

export function isChildModePathForbidden(pathname: string): boolean {
  return CHILD_FORBIDDEN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function toManagedProfileSelection(profile: ManagedProfile): Omit<ManagedProfileSelection, "managerProfileId"> {
  return {
    customerType: profile.customerType,
    externalSubjectId: profile.externalSubjectId,
    isOwner: profile.membership.isOwner,
    membershipRole: profile.membership.role,
    targetEmail: profile.contactEmail ?? profile.externalSubjectId,
    targetProfileId: profile.profileId
  };
}
