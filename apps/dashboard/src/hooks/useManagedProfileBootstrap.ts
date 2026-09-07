import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toManagedProfileSelection } from "@/components/managed-profiles/managed-profile-ui";
import { isApiError } from "@/services/api/api-client";
import { ManagedProfilesService } from "@/services/api/managed-profiles.service";
import { AuthService, type ManagedProfileSelection } from "@/services/auth";
import { clearManagedProfileSelection, refreshManagedProfileSelection } from "@/stores/managed-profile.store";

const INVALID_SELECTION_CODES = new Set(["MANAGED_PROFILE_MEMBERSHIP_INVALID"]);

export function useManagedProfileBootstrap(selection: ManagedProfileSelection | null): void {
  const navigate = useNavigate();
  const selectionSnapshot = selection ? AuthService.getAcceptedManagedProfileSelectionSnapshot() : null;
  const bootstrap = useQuery({
    enabled: selection !== null && selectionSnapshot !== null,
    queryFn: ({ signal }) => ManagedProfilesService.get(selection?.targetProfileId ?? "", { bootstrap: true, signal }),
    queryKey: ["managed-profile-bootstrap", selection?.managerProfileId, selection?.targetProfileId],
    refetchOnWindowFocus: "always",
    retry: (failureCount, error) =>
      !(isApiError(error) && INVALID_SELECTION_CODES.has(error.data.code ?? "")) && failureCount < 2,
    staleTime: 30_000
  });

  useEffect(() => {
    if (!selection || !selectionSnapshot || !bootstrap.data) return;
    if (
      bootstrap.data.actor.profileId !== selection.managerProfileId ||
      bootstrap.data.managedProfile.profileId !== selection.targetProfileId ||
      bootstrap.data.managedProfile.status !== "active"
    ) {
      if (clearManagedProfileSelection(selectionSnapshot)) navigate({ replace: true, to: "/managed-profiles" });
      return;
    }
    refreshManagedProfileSelection(toManagedProfileSelection(bootstrap.data.managedProfile), selectionSnapshot);
  }, [bootstrap.data, navigate, selection, selectionSnapshot]);

  useEffect(() => {
    if (!selectionSnapshot || !isApiError(bootstrap.error) || !INVALID_SELECTION_CODES.has(bootstrap.error.data.code ?? "")) {
      return;
    }
    if (clearManagedProfileSelection(selectionSnapshot)) navigate({ replace: true, to: "/managed-profiles" });
  }, [bootstrap.error, navigate, selectionSnapshot]);
}
