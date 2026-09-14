import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { ManagedProfilesList } from "@/components/managed-profiles/ManagedProfilesList";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isManagedProfilesAccessDenied, useManagedProfiles } from "@/hooks/useManagedProfiles";
import { useManagedProfileSelection } from "@/stores/managed-profile.store";

const PAGE_LIMIT = 20;

export const Route = createFileRoute("/_app/managed-profiles")({
  component: ManagedProfilesPage
});

function ManagedProfilesPage() {
  const [offset, setOffset] = useState(0);
  const selection = useManagedProfileSelection();
  const profiles = useManagedProfiles({ limit: PAGE_LIMIT, offset });

  if (selection) return <Navigate replace to="/overview" />;
  if (profiles.isLoading) return <Skeleton className="mx-auto mt-12 h-80 max-w-6xl" />;
  if (profiles.isError && isManagedProfilesAccessDenied(profiles.error)) return <Navigate replace to="/overview" />;

  return (
    <Stagger className="mx-auto grid max-w-6xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Managed profiles</h1>
        <p className="max-w-2xl text-muted-foreground">Choose a profile to act for using the actions menu.</p>
      </StaggerItem>
      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {profiles.isError || !profiles.data ? (
              <div className="grid justify-items-start gap-3 py-6">
                <p className="text-muted-foreground text-sm">
                  Could not load managed profiles. Check your connection and try again.
                </p>
                <Button onClick={() => profiles.refetch()} size="sm" type="button" variant="outline">
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <ManagedProfilesList
                  corridors={profiles.data.manager.allowedCorridors}
                  profiles={profiles.data.managedProfiles}
                />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    disabled={offset === 0}
                    onClick={() => setOffset(value => Math.max(0, value - PAGE_LIMIT))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={offset + profiles.data.pagination.limit >= profiles.data.pagination.total}
                    onClick={() => setOffset(value => value + PAGE_LIMIT)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
