import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Team } from "@/components/managed-profiles/Team";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/_app/team")({ component: TeamPage });

function TeamPage() {
  const selection = useManagedProfileSelection();
  const impersonation = useImpersonationSession();
  if (!selection) return <Navigate replace to="/managed-profiles" />;
  if (impersonation)
    return (
      <div className="mx-auto grid max-w-5xl gap-3">
        <h1 className="font-semibold text-2xl">Team</h1>
        <p>Team access is unavailable during impersonation. Exit impersonation to use your own membership.</p>
      </div>
    );
  // A live downgrade or child switch also discards any open mutation dialog.
  return (
    <Team
      key={`${selection.managerProfileId}:${selection.targetProfileId}:${selection.membershipRole}`}
      selection={selection}
    />
  );
}
