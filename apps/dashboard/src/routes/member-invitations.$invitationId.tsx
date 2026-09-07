import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { toManagedProfileSelection } from "@/components/managed-profiles/managed-profile-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MANAGED_PROFILES_QUERY_KEY } from "@/hooks/useManagedProfiles";
import { isApiError } from "@/services/api/api-client";
import {
  ManagedProfileMembershipsService as service,
  shouldRetryMembershipQuery
} from "@/services/api/managed-profile-memberships.service";
import { ManagedProfilesService } from "@/services/api/managed-profiles.service";
import { AuthService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { useImpersonationSession } from "@/stores/impersonation.store";
import { selectManagedProfile } from "@/stores/managed-profile.store";

export const Route = createFileRoute("/member-invitations/$invitationId")({ component: InvitationPage });

function InvitationPage() {
  const { invitationId } = Route.useParams();
  const user = useAuthStore(state => state.user);
  const impersonation = useImpersonationSession();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="grid w-full max-w-lg gap-6">
        <div className="flex justify-center">
          <VortexLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Team invitation</CardTitle>
            <CardDescription>Access a managed profile with your own Vortex account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {impersonation ? (
              <>
                <p>Invitations are unavailable during impersonation. Exit impersonation before continuing.</p>
                <Button asChild variant="outline">
                  <Link to="/overview">Return to dashboard</Link>
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
  const navigate = useNavigate();
  const logout = useAuthStore(state => state.logout);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const preview = useQuery({
    gcTime: 0,
    queryFn: ({ signal }) => service.preview(invitationId, signal),
    queryKey: ["member-invitation", userId, invitationId],
    refetchOnWindowFocus: "always",
    retry: shouldRetryMembershipQuery
  });
  const accept = useMutation({
    mutationFn: () => service.accept(invitationId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [MANAGED_PROFILES_QUERY_KEY] }),
        client.invalidateQueries({ queryKey: ["managed-profile-bootstrap"] }),
        client.invalidateQueries({ queryKey: ["managed-profile-team"] })
      ]);
    }
  });
  const error = accept.error ?? preview.error;
  const code = isApiError(error) ? error.data.code : undefined;
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

  async function openProfile() {
    const profileId = accept.data?.managedProfileId ?? preview.data?.managedProfile.profileId;
    if (!profileId || opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      // Preview roles are not selection authority; membership may have changed since acceptance.
      const result = await ManagedProfilesService.get(profileId);
      if (AuthService.getEffectiveBearerProfileId() !== userId || AuthService.getAcceptedImpersonationSessionSnapshot()) return;
      if (
        result.actor.profileId !== userId ||
        result.managedProfile.profileId !== profileId ||
        result.managedProfile.status !== "active"
      )
        throw new Error("Invalid membership");
      if (!selectManagedProfile(toManagedProfileSelection(result.managedProfile))) {
        setOpenError("Finish or cancel the current transfer signing step before changing profiles.");
        return;
      }
      await navigate({ to: "/overview" });
    } catch {
      setOpenError("Could not open this profile. Your membership may have changed. Try again or contact a manager.");
    } finally {
      setOpening(false);
    }
  }

  if (status === "success" || status === "accepted" || code === "MEMBERSHIP_ALREADY_EXISTS") {
    return (
      <>
        <h2 className="font-semibold">
          {status === "success"
            ? "Invitation accepted"
            : code === "MEMBERSHIP_ALREADY_EXISTS"
              ? "You already have access"
              : "Invitation already accepted"}
        </h2>
        <p className="text-sm">Open the profile to view your current access. Opening it does not change your role.</p>
        {openError && (
          <p className="text-destructive text-sm" role="alert">
            {openError}
          </p>
        )}
        <Button disabled={opening} onClick={openProfile}>
          {opening ? "Opening profile..." : "Open profile"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/managed-profiles">View managed profiles</Link>
        </Button>
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
      <h2 className="break-all font-semibold">Join {preview.data.managedProfile.externalSubjectId}</h2>
      <p className="break-all text-sm">Invited by {preview.data.inviter.email ?? preview.data.inviter.profileId}</p>
      <p className="text-sm">
        Role: <strong>{preview.data.invitation.role === "manager" ? "Manager" : "Read only"}</strong>
      </p>
      <p className="text-muted-foreground text-sm">
        {preview.data.invitation.role === "manager"
          ? "You can manage this profile, including non-owner team access and child credentials."
          : "You can view this profile's data, but cannot make changes."}
      </p>
      <p className="text-muted-foreground text-xs">Expires {new Date(preview.data.invitation.expiresAt).toLocaleString()}</p>
      <Button disabled={accept.isPending || preview.isFetching} onClick={() => accept.mutate()}>
        {accept.isPending ? "Accepting invitation..." : "Accept invitation"}
      </Button>
    </>
  );
}
