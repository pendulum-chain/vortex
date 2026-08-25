import { useQuery } from "@tanstack/react-query";
import type { LimitsCorridor } from "@vortexfi/shared";
import { useMemo } from "react";
import { useApprovedCorridors } from "@/hooks/useApprovedCorridors";
import { LimitsService } from "@/services/api/limits.service";

export const LIMITS_QUERY_KEY = ["limits"] as const;

export function useLimits() {
  const { approved, isLoading: isLoadingCorridors } = useApprovedCorridors();
  const corridors = useMemo(
    () =>
      [...approved]
        .filter((corridor): corridor is LimitsCorridor => corridor !== "EU")
        .sort((first, second) => first.localeCompare(second)),
    [approved]
  );
  const query = useQuery({
    enabled: !isLoadingCorridors && corridors.length > 0,
    queryFn: () => LimitsService.get({ corridors }),
    queryKey: [...LIMITS_QUERY_KEY, ...corridors],
    retry: false
  });

  return { ...query, corridors, isLoadingCorridors };
}
