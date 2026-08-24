import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminAccountsTable } from "@/components/admin/AdminAccountsTable";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccounts, useAdminImpersonationSessions } from "@/hooks/useAdminConsole";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_LIMIT = 20;

export const Route = createFileRoute("/_app/admin/")({
  component: AdminAccountsPage
});

function AdminAccountsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack.at(-1);

  const accounts = useAdminAccounts({ cursor, limit: PAGE_LIMIT, search: debouncedSearch || undefined });
  const sessions = useAdminImpersonationSessions();

  return (
    <Stagger className="mx-auto grid max-w-6xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Admin</h1>
        <p className="max-w-2xl text-muted-foreground">Look up customer accounts and log in as one for support.</p>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <Input
              className="max-w-sm"
              onChange={event => {
                // A new search invalidates the current position in the result set.
                setSearch(event.target.value);
                setCursorStack([]);
              }}
              placeholder="Search by email or external ID…"
              value={search}
            />
          </CardHeader>
          <CardContent>
            {accounts.isLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : accounts.isError ? (
              <div className="grid justify-items-start gap-3 py-6">
                <p className="text-muted-foreground text-sm">Could not load accounts.</p>
                <Button onClick={() => accounts.refetch()} size="sm" variant="outline">
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <AdminAccountsTable accounts={accounts.data?.accounts ?? []} />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    disabled={cursorStack.length === 0}
                    onClick={() => setCursorStack(stack => stack.slice(0, -1))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={!accounts.data?.nextCursor}
                    onClick={() => {
                      const nextCursor = accounts.data?.nextCursor;
                      if (nextCursor) setCursorStack(stack => [...stack, nextCursor]);
                    }}
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

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Recent impersonation activity</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : sessions.isError ? (
              <div className="grid justify-items-start gap-3 py-6">
                <p className="text-muted-foreground text-sm">Could not load impersonation activity.</p>
                <Button onClick={() => sessions.refetch()} size="sm" variant="outline">
                  Try again
                </Button>
              </div>
            ) : !sessions.data || sessions.data.sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No impersonation sessions yet.</p>
            ) : (
              <ul className="grid gap-2">
                {sessions.data.sessions.map(session => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={session.id}>
                    <span>
                      <span className="font-medium">{session.actor.email ?? session.actor.id}</span> acting as{" "}
                      <span className="font-medium">{session.target.email ?? session.target.id}</span>
                      <span className="block text-muted-foreground text-xs">
                        {new Date(session.createdAt).toLocaleString()}
                      </span>
                    </span>
                    <Badge variant={session.active ? "success" : "secondary"}>{session.active ? "Active" : "Ended"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
