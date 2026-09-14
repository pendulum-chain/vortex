import type { AdminAccountIdentity } from "@/services/api/admin-console.service";
import type { ManagedProfileSelection } from "@/services/auth";

export interface AdminImpersonationTarget {
  email: string;
  id: string;
  label: string;
  managedProfile?: Omit<ManagedProfileSelection, "managerProfileId">;
}

export function getAdminAccountLabel(account: AdminAccountIdentity): string {
  return account.email ?? account.managedProfile?.contactEmail ?? account.managedProfile?.externalSubjectId ?? account.id;
}

export function toAdminImpersonationTarget(account: AdminAccountIdentity): AdminImpersonationTarget | null {
  const label = getAdminAccountLabel(account);
  if (account.kind === "authenticated") {
    return account.email ? { email: account.email, id: account.id, label } : null;
  }

  const managed = account.managedProfile;
  if (!managed || managed.status !== "active" || !managed.customerType || !managed.manager.isActive || !managed.manager.email) {
    return null;
  }

  return {
    email: managed.manager.email,
    id: managed.manager.profileId,
    label,
    managedProfile: {
      customerType: managed.customerType,
      externalSubjectId: managed.externalSubjectId,
      targetEmail: managed.contactEmail ?? managed.externalSubjectId,
      targetProfileId: account.id
    }
  };
}

export function canSelectManagedProfileDirectly(
  target: AdminImpersonationTarget,
  authenticatedProfileId: string | undefined
): boolean {
  return !!target.managedProfile && target.id === authenticatedProfileId;
}
