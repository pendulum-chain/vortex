import type { AccountType, CorridorId, Onboarding, OnboardingStatus } from "@/domain/types";
import type { OnboardingEntityDto, OnboardingState } from "./onboarding.service";
import { corridorFromProviderAccount } from "./recipient.mappers";

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

export function deriveOnboardings(entity: OnboardingEntityDto, type: AccountType): Partial<Record<CorridorId, Onboarding>> {
  const kind = type === "company" ? "kyb" : "kyc";
  const onboardings: Partial<Record<CorridorId, Onboarding>> = {};
  for (const account of entity.accounts) {
    const corridorId = corridorFromProviderAccount(account);
    if (!corridorId) {
      continue;
    }
    const status = STATE_TO_STATUS[account.state];
    const existing = onboardings[corridorId];
    const rank = STATUS_RANK[status];
    const existingRank = existing ? STATUS_RANK[existing.status] : -1;
    // On a tie the live EU provider wins: a legacy approved Mykobo row carries no wallet
    // readiness, so letting it shadow the Monerium row would ask for a wallet link forever.
    if (rank > existingRank || (rank === existingRank && account.provider === "monerium")) {
      onboardings[corridorId] = {
        companyName: account.companyName,
        corridorId,
        kind,
        ramp: account.ramp ?? null,
        reauthenticationRequired: account.error?.code === MONERIUM_REAUTHENTICATION_REQUIRED,
        status,
        taxReference: account.taxReference,
        updatedAt: new Date().toISOString()
      };
    }
  }
  return onboardings;
}
