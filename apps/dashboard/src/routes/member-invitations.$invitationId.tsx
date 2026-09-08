import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MANAGED_PROFILES_QUERY_KEY } from "@/hooks/useManagedProfiles";
import { ORGANIZATION_QUERY_KEY, useOrganization } from "@/hooks/useOrganization";
import { isApiError } from "@/services/api/api-client";
import { OrganizationService as service, shouldRetryMembershipQuery } from "@/services/api/managed-profile-memberships.service";
import { useAuthStore } from "@/stores/auth.store";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { clearManagedProfile, useManagedProfileSelection } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/member-invitations/$invitationId")({ component: InvitationPage });

function InvitationPage() {
  const { invitationId } = Route.useParams();
  const user = useAuthStore(state => state.user);
  const impersonation = useImpersonationSession();
  const selection = useManagedProfileSelection();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="grid w-full max-w-lg gap-6">
        <div className="flex justify-center">
          <VortexLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Team invitation</CardTitle>
            <CardDescription>Join an organization with your own Vortex account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {impersonation ? (
              <>
                <p>Invitations are unavailable during impersonation. Exit impersonation before continuing.</p>
                <Button asChild variant="outline">
                  <Link to="/overview">Return to dashboard</Link>
                </Button>
              </>
            ) : selection ? (
              <>
                <p className="break-all text-sm">
                  You are acting for {selection.targetEmail || selection.externalSubjectId}. Stop acting to review this
                  invitation with your personal account.
                </p>
                <Button
                  onClick={() => {
                    try {
                      if (clearManagedProfile() !== false) return;
                    } catch {
                      // The identity boundary also blocks changes during transfer signing.
                    }
                    toast.error("Finish or cancel the current transfer signing step before changing profiles.");
                  }}
                >
                  Stop acting to review invitation
                </Button>
              </>
            ) : !user ? (
              <>
                <p className="text-sm">
                  Sign in with the email that received this invitation to review it. Signing in does not accept the invitation.
                </p>
                <Button asChild>
                  <Link search={{ returnTo: `/member-invitations/${invitationId}` }} to="/login">
                    Sign in to review
                  </Link>
                </Button>
              </>
            ) : (
              <InvitationDetails
                invitationId={invitationId}
                key={`${user.userId}:${user.email}:${invitationId}`}
                userId={user.userId}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvitationDetails({ invitationId, userId }: { invitationId: string; userId: string }) {
  const client = useQueryClient();
  const logout = useAuthStore(state => state.logout);
  const organization = useOrganization();
  const preview = useQuery({
    gcTime: 0,
    queryFn: ({ signal }) => service.preview(invitationId, signal),
    queryKey: ["member-invitation", userId, invitationId],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });
  const accept = useMutation({
    mutationFn: () => service.accept(invitationId),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [MANAGED_PROFILES_QUERY_KEY] }),
        client.invalidateQueries({ queryKey: ["managed-profile-bootstrap"] }),
        client.invalidateQueries({ queryKey: ["organization-team"] }),
        client.invalidateQueries({ queryKey: [ORGANIZATION_QUERY_KEY] })
      ]);
    }
  });
  const error = accept.error ?? preview.error;
  const code = isApiError(error) ? error.data.code : undefined;
  if (code === "ORGANIZATION_MEMBERSHIP_CONFLICT")
    return (
      <>
        <h2 className="font-semibold">You already belong to another organization</h2>
        <p className="text-sm" role="alert">
          Each person can belong to only one organization, including owners and read-only members. Your current access has not
          changed. Resolve your existing membership with its owner before accepting this invitation.
        </p>
        <Button asChild variant="outline">
          <Link to="/team">View your current team</Link>
        </Button>
      </>
    );
  // A denial takes precedence over any cached preview, including a denial at accept time.
  if (isApiError(error) && (error.status === 403 || error.status === 401)) {
    return (
      <>
        <h2 className="font-semibold">Invitation unavailable for this account</h2>
        <p className="text-sm">Use the verified email that received the invitation. The link may also be unavailable.</p>
        <Button onClick={logout} variant="outline">
          Sign in with another account
        </Button>
      </>
    );
  }
  const status = accept.data
    ? "success"
    : code === "INVITATION_EXPIRED"
      ? "expired"
      : code === "INVITATION_CANCELLED"
        ? "cancelled"
        : code === "INVITATION_ACCEPTED"
          ? "accepted"
          : preview.data?.invitation.status;
  if (status === "expired" || status === "cancelled") {
    return (
      <>
        <h2 className="font-semibold">Invitation {status}</h2>
        <p className="text-sm">This invitation can no longer be accepted. Ask a manager for a new invitation.</p>
        <Button asChild variant="outline">
          <Link to="/overview">Return to dashboard</Link>
        </Button>
      </>
    );
  }

  if (status === "success" || status === "accepted" || code === "MEMBERSHIP_ALREADY_EXISTS") {
    const ownerProfileId = accept.data?.ownerProfileId ?? preview.data?.organization.ownerProfileId;
    const currentOrganization = !organization.isError && !organization.isFetching ? organization.data?.organization : null;
    const hasCurrentAccess = !!ownerProfileId && currentOrganization?.ownerProfileId === ownerProfileId;
    return (
      <>
        <h2 className="font-semibold">{status === "success" ? "Invitation accepted" : "Invitation already accepted"}</h2>
        {hasCurrentAccess ? (
          <>
            <p className="text-sm">
              Your current organization access covers all current and future managed profiles. You remain in your personal
              account until you explicitly choose to act for a profile.
            </p>
            <Button asChild>
              <Link to="/managed-profiles">View managed profiles</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/team">View team</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">
              Invitation status does not confirm current access. Reopening this link does not grant or restore membership.
            </p>
            {organization.isFetching || organization.isPending ? (
              <p className="text-muted-foreground text-sm">Checking current organization access...</p>
            ) : currentOrganization ? (
              <>
                <p className="break-all text-sm">
                  Your current organization is {currentOrganization.ownerEmail ?? currentOrganization.ownerProfileId}, not the
                  organization from this invitation.
                </p>
                <Button asChild variant="outline">
                  <Link to="/team">View your current team</Link>
                </Button>
              </>
            ) : organization.isError ? (
              <Button onClick={() => organization.refetch()} variant="outline">
                Retry current access check
              </Button>
            ) : (
              <p className="text-sm">You do not currently have access to this organization.</p>
            )}
            <Button asChild variant="outline">
              <Link to="/overview">Return to your dashboard</Link>
            </Button>
          </>
        )}
      </>
    );
  }
  if (error)
    return (
      <>
        <h2 className="font-semibold">Could not load invitation</h2>
        <p className="text-sm" role="alert">
          Could not confirm the invitation status. Check your connection and try again.
        </p>
        <Button
          onClick={() => {
            accept.reset();
            void preview.refetch();
          }}
          variant="outline"
        >
          Try again
        </Button>
      </>
    );
  if (preview.isPending || !preview.data) return <Skeleton aria-label="Loading invitation" className="h-32" />;

  return (
    <>
      <h2 className="break-all font-semibold">
        Join {preview.data.organization.ownerEmail ?? preview.data.organization.ownerProfileId}'s organization
      </h2>
      <p className="break-all text-sm">Invited by {preview.data.inviter.email ?? preview.data.inviter.profileId}</p>
      <p className="text-sm">
        Role: <strong>{preview.data.invitation.role === "manager" ? "Manager" : "Read only"}</strong>
      </p>
      <p className="text-muted-foreground text-sm">
        {preview.data.invitation.role === "manager"
          ? "You can manage all current and future managed profiles, including non-owner team access and child credentials. Only the owner can provision or delete profiles."
          : "You can view all current and future managed profiles, but cannot make changes."}
      </p>
      <p className="text-muted-foreground text-sm">
        Personal account resources are not shared. Each person can belong to only one organization. Accepting confirms you want
        to join using the verified email that received this invitation.
      </p>
      <p className="text-muted-foreground text-xs">Expires {new Date(preview.data.invitation.expiresAt).toLocaleString()}</p>
      <Button disabled={accept.isPending || preview.isFetching} onClick={() => accept.mutate()}>
        {accept.isPending ? "Accepting invitation..." : "Accept invitation"}
      </Button>
    </>
  );
}
