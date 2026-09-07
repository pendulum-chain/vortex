import { createFileRoute } from "@tanstack/react-router";
import { ApiCredentialsTable } from "@/components/api-keys/ApiCredentialsTable";
import { CreateApiCredentialDialog } from "@/components/api-keys/CreateApiCredentialDialog";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CHILD_CREDENTIAL_WARNING } from "@/domain/api-credentials";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/_app/api-keys")({
  component: ApiKeysPage
});

function ApiKeysPage() {
  const managedProfile = useManagedProfileSelection();
  const impersonation = useImpersonationSession();
  const canMutate = impersonation === null && (managedProfile === null || managedProfile.membershipRole === "manager");

  return (
    <Stagger className="mx-auto grid max-w-6xl gap-6">
      <StaggerItem className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-balance font-semibold text-2xl tracking-tight">API keys</h1>
          <p className="max-w-2xl text-muted-foreground">
            {managedProfile
              ? `Credentials owned by ${managedProfile.targetEmail}. Secret keys are never shown twice.`
              : "Create user-linked credentials for server-side Vortex SDK integrations. Secret keys are never shown twice."}
          </p>
        </div>
        {canMutate && <CreateApiCredentialDialog />}
      </StaggerItem>
      {managedProfile && (
        <StaggerItem className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {CHILD_CREDENTIAL_WARNING}
        </StaggerItem>
      )}
      {!canMutate && (
        <StaggerItem className="rounded-lg border bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
          Credentials are read-only {impersonation ? "during impersonation" : "for this membership"}.
        </StaggerItem>
      )}
      <StaggerItem>
        <ApiCredentialsTable canMutate={canMutate} />
      </StaggerItem>
    </Stagger>
  );
}
