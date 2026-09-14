import { Link } from "@tanstack/react-router";
import { LogIn, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminAccountSummary } from "@/services/api/admin-console.service";
import { type AdminImpersonationTarget, getAdminAccountLabel, toAdminImpersonationTarget } from "./admin-account-ui";
import { ImpersonateDialog } from "./ImpersonateDialog";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function verificationEntries(summary: AdminAccountSummary["verificationSummary"]) {
  return Object.entries(summary).filter(([, count]) => count > 0);
}

export function AdminAccountsTable({ accounts }: { accounts: AdminAccountSummary[] }) {
  const [target, setTarget] = useState<AdminImpersonationTarget | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Entities</TableHead>
            <TableHead>Verification</TableHead>
            <TableHead>Pricing partner</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map(account => {
            const impersonationTarget = toAdminImpersonationTarget(account);
            return (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-medium hover:underline" params={{ profileId: account.id }} to="/admin/$profileId">
                        {getAdminAccountLabel(account)}
                      </Link>
                      {account.kind === "managed" && <Badge variant="secondary">Managed</Badge>}
                    </div>
                    {account.managedProfile && (
                      <span className="text-muted-foreground text-xs">
                        Managed by {account.managedProfile.manager.email ?? account.managedProfile.manager.profileId}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {account.entities.length === 0 ? (
                      <span className="text-muted-foreground text-xs">None</span>
                    ) : (
                      account.entities.map(entity => (
                        <Badge key={entity.id} variant="outline">
                          {entity.type} · {entity.status}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {verificationEntries(account.verificationSummary).length === 0 ? (
                      <span className="text-muted-foreground text-xs">None</span>
                    ) : (
                      verificationEntries(account.verificationSummary).map(([status, count]) => (
                        <Badge key={status} variant="secondary">
                          {count} {status.replace("_", " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{account.activePartnerName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(account.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={!impersonationTarget}
                    onClick={() => setTarget(impersonationTarget)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <LogIn />
                    Login as
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {accounts.length === 0 && (
        <div className="grid justify-items-center gap-2 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Users className="size-5" />
          </span>
          <p className="font-medium">No accounts found</p>
        </div>
      )}
      <ImpersonateDialog onOpenChange={open => !open && setTarget(null)} target={target} />
    </>
  );
}
