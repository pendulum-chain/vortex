import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { createMoneriumKycApi, createMoneriumKycMachine, type MoneriumOAuthCallback } from "@vortexfi/kyc";
import { useMachine } from "@xstate/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import { VortexLogo } from "@/components/layout/VortexLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api/api-client";
import { AuthService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  state: z.string().optional()
});

export const Route = createFileRoute("/monerium/callback")({
  component: MoneriumCallbackPage,
  validateSearch: searchSchema
});

const moneriumCallbackMachine = createMoneriumKycMachine({
  api: createMoneriumKycApi(apiClient),
  openAuthorizationUrl: url => window.location.assign(url)
});

const DASHBOARD_STATES = new Set(["Approved", "InReview", "Ready", "Rejected"]);

function callbackFrom(search: z.infer<typeof searchSchema>): MoneriumOAuthCallback {
  if (search.code && search.state) return { code: search.code, state: search.state };
  return {
    error: search.error ?? "invalid_callback",
    errorDescription: search.error_description ?? "The Monerium callback was incomplete. Please start again."
  };
}

function MoneriumCallbackPage() {
  const restoreSession = useAuthStore(state => state.restoreSession);
  const user = useAuthStore(state => state.user);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [state] = useMachine(moneriumCallbackMachine, {
    input: { callback: callbackFrom(search), customerType: "individual" }
  });
  const value = String(state.value);

  useEffect(() => {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}`);
  }, []);

  useEffect(() => {
    if (DASHBOARD_STATES.has(value)) {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY });
      restoreSession();
      navigate({ replace: true, search: { onboarding: "EU" }, to: "/overview" });
    }
  }, [navigate, restoreSession, value]);

  if (!user && !AuthService.getTokens()) return <Navigate to="/login" />;

  const goToDashboard = () => navigate({ to: "/overview" });
  const isLoading = value === "Routing" || value === "CompletingAuthorization" || DASHBOARD_STATES.has(value);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <VortexLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Monerium verification</CardTitle>
            <CardDescription>Completing your secure Europe onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            {isLoading ? (
              <>
                <Loader2 className="size-9 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Confirming your authorization...</p>
              </>
            ) : (
              <>
                <AlertTriangle className="size-10 text-destructive" />
                <p className="font-medium">Could not complete verification</p>
                <p className="text-muted-foreground text-sm">{state.context.error?.message ?? "Please start again."}</p>
              </>
            )}
          </CardContent>
          {!isLoading && (
            <CardFooter>
              <Button className="w-full" onClick={goToDashboard}>
                Return to dashboard
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </main>
  );
}
