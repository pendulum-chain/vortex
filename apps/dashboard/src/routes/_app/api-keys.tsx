import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiCredentialsTable } from "@/components/api-keys/ApiCredentialsTable";
import { CreateApiCredentialDialog } from "@/components/api-keys/CreateApiCredentialDialog";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { AuthService } from "@/services/auth";

export const Route = createFileRoute("/_app/api-keys")({
  beforeLoad: () => {
    if (AuthService.getManagedProfileSelection()) throw redirect({ to: "/overview" });
  },
  component: ApiKeysPage
});

function ApiKeysPage() {
  return (
    <Stagger className="mx-auto grid max-w-6xl gap-6">
      <StaggerItem className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-balance font-semibold text-2xl tracking-tight">API keys</h1>
          <p className="max-w-2xl text-muted-foreground">
            Create user-linked credentials for server-side Vortex SDK integrations. Secret keys are never shown twice.
          </p>
        </div>
        <CreateApiCredentialDialog />
      </StaggerItem>
      <StaggerItem>
        <ApiCredentialsTable />
      </StaggerItem>
    </Stagger>
  );
}
