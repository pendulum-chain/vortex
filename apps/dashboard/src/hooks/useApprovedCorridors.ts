import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CorridorId } from "@/domain/types";
import { OnboardingService, type OnboardingStatusResponse } from "@/services/api/onboarding.service";
import { corridorFromProviderAccount } from "@/services/api/recipient.mappers";

export const ONBOARDING_STATUS_QUERY_KEY = ["onboarding-status"] as const;

/** Corridors the authenticated profile is provider-approved for — the real approval gate. */
export function approvedCorridorsFrom(data: OnboardingStatusResponse | undefined): Set<CorridorId> {
  const approved = new Set<CorridorId>();
  for (const entity of data?.entities ?? []) {
    for (const account of entity.accounts) {
      if (account.state !== "approved") {
        continue;
      }
      const corridorId = corridorFromProviderAccount(account);
      if (corridorId) {
        approved.add(corridorId);
      }
    }
  }
  return approved;
}

/** Raw GET /v1/onboarding/status query — shared by the approval gate and the account hook. */
export function useOnboardingStatusQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => OnboardingService.status(),
    queryKey: ONBOARDING_STATUS_QUERY_KEY,
    staleTime: 30_000
  });
}

/**
 * The set of corridors the authenticated user has an approved provider account for,
 * read from GET /v1/onboarding/status. Drives self-recipients and which corridors a
 * sender can invite recipients for.
 */
export function useApprovedCorridors(enabled = true): { approved: Set<CorridorId>; isLoading: boolean } {
  const { data, isLoading } = useOnboardingStatusQuery(enabled);
  const approved = useMemo(() => approvedCorridorsFrom(data), [data]);
  return { approved, isLoading };
}
