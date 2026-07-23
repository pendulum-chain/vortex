import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CORRIDORS } from "@/domain/corridors";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { isApiError } from "@/services/api/api-client";
import { CORRIDOR_BY_RAIL } from "@/services/api/mappers";
import { OnboardingService } from "@/services/api/onboarding.service";
import { type InvitePreviewResponse, RecipientsService } from "@/services/api/recipients.service";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage
});

/**
 * Dashboard-side invite deep link (discount-carrying invites point here instead of the
 * widget): sign in if needed, confirm with the active account shown — links are bearer
 * tokens and redemption binds the first acceptor permanently — then redeem, fix the
 * account type from the invitation, and land on onboarding with the corridor ready.
 */
function InvitePage() {
  const user = useAuthStore(state => state.user);
  const { token } = Route.useParams();

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        {user ? (
          <ConfirmInviteCard email={user.email} token={token} />
        ) : (
          <AuthCard
            description="Sign in or create your account to accept the invite you received."
            title="You've been invited to Vortex"
          />
        )}
      </div>
    </div>
  );
}

function inviteTypeLabel(preview: InvitePreviewResponse): string {
  return preview.inviteeType === "business" ? "company" : "individual";
}

function ConfirmInviteCard({ email, token }: { email: string; token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore(state => state.logout);

  // Gate-checked, read-only: a declined confirmation leaves the invite fully redeemable.
  const preview = useQuery({
    queryFn: () => RecipientsService.previewInvite(token),
    queryKey: ["invite-preview", token],
    retry: false
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!preview.data) {
        throw new Error("The invite is still loading.");
      }
      const type = preview.data.inviteeType === "business" ? ("business" as const) : ("individual" as const);
      // Fix the account type BEFORE redeeming: an established profile of the other type
      // cannot switch (ACTIVE_ENTITY_IMMUTABLE), and that must fail while the invite is
      // still unconsumed — not after the sender has been notified.
      try {
        await OnboardingService.selectActiveEntity(type);
      } catch (error) {
        if (isApiError(error) && error.status === 409) {
          throw new Error(
            preview.data.inviteeType === "business"
              ? "This invite is for a company account, but this profile already operates as an individual. Use a different account to accept it."
              : "This invite is for an individual account, but this profile already operates as a company. Use a different account to accept it."
          );
        }
        throw error;
      }
      return RecipientsService.acceptInvite(token);
    },
    onSuccess: async accepted => {
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY });
      const invited = CORRIDOR_BY_RAIL[accepted.invitation.rail];
      navigate({ replace: true, search: invited ? { invited } : {}, to: "/overview" });
    }
  });

  if (preview.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Checking your invite</CardTitle>
          <CardDescription>One moment…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (preview.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">This invite could not be opened</CardTitle>
          <CardDescription>
            {(preview.error instanceof Error && preview.error.message) || "The link may have expired or already been used."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button className="w-full" onClick={() => preview.refetch()} type="button">
            Try again
          </Button>
          <Button className="w-full" onClick={logout} type="button" variant="outline">
            Use a different account
          </Button>
        </CardContent>
      </Card>
    );
  }

  const corridorId = CORRIDOR_BY_RAIL[preview.data.rail];
  const corridor = corridorId ? CORRIDORS[corridorId] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Accept your invite</CardTitle>
        <CardDescription>
          You've been invited to Vortex as a {inviteTypeLabel(preview.data)}
          {corridor ? ` for ${corridor.flag} ${corridor.name} · ${corridor.currency}` : ""}. Accepting links the invite to{" "}
          <span className="font-medium">{email}</span> permanently.
        </CardDescription>
      </CardHeader>
      {accept.isError && (
        <CardContent>
          <p className="text-destructive text-sm">
            {(accept.error instanceof Error && accept.error.message) || "The invite could not be accepted."}
          </p>
        </CardContent>
      )}
      <CardFooter className="grid gap-2">
        <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()} type="button">
          {accept.isPending ? "Accepting…" : "Accept invite"}
        </Button>
        <Button className="w-full" onClick={logout} type="button" variant="outline">
          Use a different account
        </Button>
      </CardFooter>
    </Card>
  );
}
