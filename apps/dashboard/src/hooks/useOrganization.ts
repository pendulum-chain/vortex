import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { OrganizationService, shouldRetryMembershipQuery } from "@/services/api/managed-profile-memberships.service";
import { useAuthStore } from "@/stores/auth.store";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";
import { MANAGED_PROFILES_QUERY_KEY } from "./useManagedProfiles";

export const ORGANIZATION_QUERY_KEY = "organization";

export function useOrganization() {
  const actorId = useAuthStore(state => state.user?.userId);
  const impersonation = useImpersonationSession();
  const selection = useManagedProfileSelection();
  const client = useQueryClient();
  const query = useQuery({
    enabled: !!actorId && !impersonation && !selection,
    queryFn: ({ signal }) => OrganizationService.get(signal),
    queryKey: [ORGANIZATION_QUERY_KEY, actorId],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });

  // Organization authority applies to every current and future child, not just a selected one.
  useEffect(() => {
    if (!query.dataUpdatedAt && !query.errorUpdatedAt) return;
    void client.invalidateQueries({ queryKey: [MANAGED_PROFILES_QUERY_KEY] });
    void client.invalidateQueries({ queryKey: ["managed-profile-bootstrap"] });
  }, [client, query.dataUpdatedAt, query.errorUpdatedAt]);

  return query;
}
