import { useMemo } from "react";
import { CORRIDOR_LIST } from "@/domain/corridors";
import type { AccountType, CorridorId, Onboarding, OnboardingStatus, SenderAccount } from "@/domain/types";
import type { OnboardingState, OnboardingStatusResponse } from "@/services/api/onboarding.service";
import { corridorFromProviderAccount } from "@/services/api/recipient.mappers";
import { useAuthStore } from "@/stores/auth.store";
import { useOnboardingStatusQuery } from "./useApprovedCorridors";

const LIVE_CORRIDORS: CorridorId[] = CORRIDOR_LIST.filter(corridor => corridor.availability === "live").map(
  corridor => corridor.id
);

const STATE_TO_STATUS: Record<OnboardingState, OnboardingStatus> = {
  approved: "approved",
  in_review: "in_review",
  pending: "pending",
  rejected: "rejected"
};

// When a corridor has several provider accounts, surface the furthest-along one.
const STATUS_RANK: Record<OnboardingStatus, number> = {
  approved: 4,
  in_review: 3,
  not_started: 0,
  pending: 2,
  rejected: 1
};

function deriveType(data: OnboardingStatusResponse | undefined): AccountType {
  const hasBusiness = (data?.entities ?? []).some(entity => entity.type === "business" || entity.type === "company");
  return hasBusiness ? "company" : "individual";
}

function deriveOnboardings(
  data: OnboardingStatusResponse | undefined,
  type: AccountType
): Partial<Record<CorridorId, Onboarding>> {
  const kind = type === "company" ? "kyb" : "kyc";
  const onboardings: Partial<Record<CorridorId, Onboarding>> = {};
  for (const entity of data?.entities ?? []) {
    for (const account of entity.accounts) {
      const corridorId = corridorFromProviderAccount(account);
      if (!corridorId) {
        continue;
      }
      const status = STATE_TO_STATUS[account.state];
      const existing = onboardings[corridorId];
      if (!existing || STATUS_RANK[status] > STATUS_RANK[existing.status]) {
        onboardings[corridorId] = { corridorId, kind, status, updatedAt: new Date().toISOString() };
      }
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
    if (!user) {
      return undefined;
    }
    const type = deriveType(data);
    return {
      id: user.userId,
      identifier: user.email,
      name: user.name,
      onboardings: deriveOnboardings(data, type),
      selectedCorridors: LIVE_CORRIDORS,
      type
    };
  }, [user, data]);
}
