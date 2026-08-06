import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { ImpersonateDialog } from "@/components/admin/ImpersonateDialog";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccount } from "@/hooks/useAdminConsole";
import { useOnboardingStatusQuery } from "@/hooks/useApprovedCorridors";

export const Route = createFileRoute("/_app/admin/$profileId")({
  component: AdminAccountDetailPage
});

function AdminAccountDetailPage() {
  const onboardingStatus = useOnboardingStatusQuery();
  const isAdmin = onboardingStatus.data?.roles.includes("vortex_admin") ?? false;

  if (onboardingStatus.isLoading) {
    return <Skeleton className="mx-auto mt-20 h-80 max-w-3xl" />;
  }
  if (!isAdmin) {
    return <Navigate to="/overview" />;
  }
  return <AccountDetail />;
}

function AccountDetail() {
  const { profileId } = Route.useParams();
  const account = useAdminAccount(profileId);
  const [impersonateTarget, setImpersonateTarget] = useState<{ id: string; email: string } | null>(null);

  if (account.isLoading) {
    return <Skeleton className="mx-auto mt-20 h-80 max-w-3xl" />;
  }

  if (account.isError || !account.data) {
    return (
      <div className="mx-auto mt-20 max-w-lg space-y-4 rounded-lg border p-8 text-center">
        <h1 className="font-semibold text-xl">Could not load this account</h1>
        <Button onClick={() => account.refetch()} type="button">
          Try again
        </Button>
      </div>
    );
  }

  const data = account.data;

  return (
    <Stagger className="mx-auto grid max-w-4xl gap-6">
      <StaggerItem className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-balance font-semibold text-2xl tracking-tight">{data.email}</h1>
          <p className="text-muted-foreground text-sm">Account since {new Date(data.createdAt).toLocaleDateString()}</p>
        </div>
        <Button onClick={() => setImpersonateTarget({ email: data.email, id: data.id })} type="button">
          Log in as
        </Button>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Customer entities</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {data.entities.length === 0 ? (
              <p className="text-muted-foreground text-sm">No customer entities.</p>
            ) : (
              data.entities.map(entity => (
                <div className="grid gap-2 rounded-lg border p-4" key={entity.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium capitalize">{entity.type}</span>
                    {entity.country && <span className="text-muted-foreground text-sm">{entity.country}</span>}
                    <Badge variant="outline">{entity.status}</Badge>
                    {entity.id === data.activeEntityId && <Badge variant="success">Active</Badge>}
                  </div>
                  {entity.providerCustomers.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No provider accounts.</p>
                  ) : (
                    entity.providerCustomers.map(provider => (
                      <div className="grid gap-1 border-t pt-2 text-sm" key={provider.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">
                            {provider.provider}
                            {provider.rail ? ` · ${provider.rail}` : ""}
                          </span>
                          <Badge variant="outline">{provider.status.replace("_", " ")}</Badge>
                        </div>
                        {provider.kycCase && (
                          <div className="flex items-center justify-between gap-3 text-muted-foreground">
                            <span>
                              KYC {provider.kycCase.type}
                              {provider.kycCase.level ? ` · ${provider.kycCase.level}` : ""}
                            </span>
                            <Badge variant="secondary">{provider.kycCase.status}</Badge>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Recent impersonation sessions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {data.impersonationSessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No impersonation sessions yet.</p>
            ) : (
              data.impersonationSessions.map(session => (
                <div className="flex items-center justify-between gap-3 text-sm" key={session.id}>
                  <span>
                    <span className="font-medium">{session.actor.email ?? session.actor.id}</span> ·{" "}
                    {new Date(session.createdAt).toLocaleString()}
                  </span>
                  <Badge variant={session.active ? "success" : "secondary"}>{session.active ? "Active" : "Ended"}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      <ImpersonateDialog onOpenChange={open => !open && setImpersonateTarget(null)} target={impersonateTarget} />
    </Stagger>
  );
}
