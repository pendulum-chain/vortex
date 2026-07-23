import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { CORRIDOR_BY_RAIL } from "@/services/api/mappers";
import { OnboardingService } from "@/services/api/onboarding.service";
import { RecipientsService } from "@/services/api/recipients.service";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage
});

/**
 * Dashboard-side invite deep link (discount-carrying invites point here instead of the
 * widget): sign in if needed, redeem the invite for this profile, fix the account type
 * from the invitation, then land on the onboarding screen with the invited corridor ready.
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
          <AcceptInviteCard token={token} />
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

function AcceptInviteCard({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const accept = useMutation({
    mutationFn: async () => {
      const accepted = await RecipientsService.acceptInvite(token);
      // The invitation fixes the account type — selecting the entity here skips the
      // "How will you use Vortex?" step and makes provider onboarding attach to the
      // same customer entity the acceptance linked to the sender.
      await OnboardingService.selectActiveEntity(accepted.invitation.inviteeType === "business" ? "business" : "individual");
      return accepted;
    },
    onSuccess: async accepted => {
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY });
      const invited = CORRIDOR_BY_RAIL[accepted.invitation.rail];
      navigate({ replace: true, search: invited ? { invited } : {}, to: "/overview" });
    }
  });

  // Redeem exactly once per mount; re-entry by the accepting user is idempotent server-side.
  const started = useRef(false);
  const { mutate } = accept;
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      mutate();
    }
  }, [mutate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {accept.isError ? "This invite could not be accepted" : "Accepting your invite"}
        </CardTitle>
        <CardDescription>
          {accept.isError
            ? (accept.error instanceof Error && accept.error.message) || "The link may have expired or already been used."
            : "Linking your account to the sender…"}
        </CardDescription>
      </CardHeader>
      {accept.isError && (
        <CardContent>
          <Button className="w-full" onClick={() => accept.mutate()} type="button">
            Try again
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
