import { useMemo } from "react";
import type { AccountType, CorridorId, Onboarding, OnboardingStatus, SenderAccount } from "@/domain/types";
import type { OnboardingEntityDto, OnboardingState } from "@/services/api/onboarding.service";
import { corridorFromProviderAccount } from "@/services/api/recipient.mappers";
import { useAuthStore } from "@/stores/auth.store";
import { useOnboardingStatusQuery } from "./useApprovedCorridors";

const STATE_TO_STATUS: Record<OnboardingState, OnboardingStatus> = {
  approved: "approved",
  in_review: "in_review",
  pending: "pending",
  rejected: "rejected",
  started: "started"
};

const MONERIUM_REAUTHENTICATION_REQUIRED = "MONERIUM_REAUTHENTICATION_REQUIRED";

// When a corridor has several provider accounts, surface the furthest-along one.
const STATUS_RANK: Record<OnboardingStatus, number> = {
  approved: 5,
  in_review: 4,
  not_started: 0,
  pending: 3,
  rejected: 1,
  started: 2
};

function deriveOnboardings(entity: OnboardingEntityDto, type: AccountType): Partial<Record<CorridorId, Onboarding>> {
  const kind = type === "company" ? "kyb" : "kyc";
  const onboardings: Partial<Record<CorridorId, Onboarding>> = {};
  for (const account of entity.accounts) {
    const corridorId = corridorFromProviderAccount(account);
    if (!corridorId) {
      continue;
    }
    const status = STATE_TO_STATUS[account.state];
    const existing = onboardings[corridorId];
    if (!existing || STATUS_RANK[status] > STATUS_RANK[existing.status]) {
      onboardings[corridorId] = {
        companyName: account.companyName,
        corridorId,
        kind,
        reauthenticationRequired: account.error?.code === MONERIUM_REAUTHENTICATION_REQUIRED,
        status,
        taxReference: account.taxReference,
        updatedAt: new Date().toISOString()
      };
    }
  }
  return onboardings;
}

/**
 * The authenticated sender account, derived from the Supabase session (identity) and
 * GET /v1/onboarding/status (type + per-corridor status). No seed data — undefined until
 * the user is authenticated.
 */
export function useActiveAccount(): SenderAccount | undefined {
  const user = useAuthStore(state => state.user);
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
      identifier: user.email,
      name: user.name,
      onboardings,
      selectedCorridors,
      type
    };
  }, [user, data]);
}
