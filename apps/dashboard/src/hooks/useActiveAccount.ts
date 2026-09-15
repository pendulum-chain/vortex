import { useMemo } from "react";
import type { AccountType, CorridorId, SenderAccount } from "@/domain/types";
import { deriveOnboardings } from "@/services/api/onboarding.mappers";
import { useAuthStore } from "@/stores/auth.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";
import { useOnboardingStatusQuery } from "./useApprovedCorridors";

/**
 * The authenticated sender account, derived from the Supabase session (identity) and
 * GET /v1/onboarding/status (type + per-corridor status). No seed data — undefined until
 * the user is authenticated.
 */
export function useActiveAccount(): SenderAccount | undefined {
  const user = useAuthStore(state => state.user);
  const managedProfile = useManagedProfileSelection();
  const { data } = useOnboardingStatusQuery(!!user);

  return useMemo(() => {
    if (!user || !data?.activeEntityId) {
      return undefined;
    }
    const entity = data.entities.find(candidate => candidate.id === data.activeEntityId);
    if (!entity) {
      return undefined;
    }
    const type: AccountType = entity.type === "business" ? "company" : "individual";
    const onboardings = deriveOnboardings(entity, type);
    const selectedCorridors = Object.keys(onboardings) as CorridorId[];
    return {
      id: entity.id,
      identifier: managedProfile ? managedProfile.externalSubjectId : user.email,
      name: managedProfile ? managedProfile.targetEmail || managedProfile.externalSubjectId : user.name,
      onboardings,
      selectedCorridors,
      type: managedProfile ? (managedProfile.customerType === "business" ? "company" : "individual") : type
    };
  }, [user, data, managedProfile]);
}
