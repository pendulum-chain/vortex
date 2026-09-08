import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Team } from "@/components/managed-profiles/Team";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthStore } from "@/stores/auth.store";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/_app/team")({ component: TeamPage });

function TeamPage() {
  const selection = useManagedProfileSelection();
  const impersonation = useImpersonationSession();
  const actorId = useAuthStore(state => state.user?.userId);
  const query = useOrganization();
  if (selection) return <Navigate replace to="/overview" />;
  if (impersonation)
    return (
      <div className="mx-auto grid max-w-5xl gap-3">
        <h1 className="font-semibold text-2xl">Team</h1>
        <p>Team access is unavailable during impersonation. Exit impersonation to use your own membership.</p>
      </div>
    );
  if (query.isError)
    return (
      <div className="mx-auto grid max-w-5xl gap-3" role="alert">
        <h1 className="font-semibold text-2xl">Team</h1>
        <p>Could not confirm your organization access.</p>
        <Button className="w-fit" onClick={() => query.refetch()} variant="outline">
          Retry organization access
        </Button>
      </div>
    );
  if (query.isPending) return <Skeleton aria-label="Loading organization" className="mx-auto h-32 max-w-5xl" />;
  const organization = query.data.organization;
  if (!organization || !actorId) return <Navigate replace to="/managed-profiles" />;
  // A live authority change discards any open mutation dialog.
  return (
    <Team
      actorId={actorId}
      authorityPending={query.isFetching}
      key={`${actorId}:${organization.ownerProfileId}:${organization.membership.role}:${organization.membership.isOwner}`}
      organization={organization}
    />
  );
}
