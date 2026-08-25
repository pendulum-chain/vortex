import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ApiCredential, keyPreview, toApiCredentials } from "@/domain/api-credentials";
import { useApiCredentials, useRevokeApiCredential } from "@/hooks/useApiCredentials";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatEnvironment(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ApiCredentialsTable() {
  const [selected, setSelected] = useState<ApiCredential | null>(null);
  const apiCredentials = useApiCredentials();
  const credentials = toApiCredentials(apiCredentials.data?.credentials ?? []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>API credentials</CardTitle>
          <CardDescription>Public keys identify requests. Secret keys authenticate requests from your server.</CardDescription>
        </CardHeader>
        <CardContent>
          {apiCredentials.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : apiCredentials.isError ? (
            <div className="grid justify-items-start gap-3 py-6">
              <p className="text-muted-foreground text-sm">Could not load your API credentials.</p>
              <Button onClick={() => apiCredentials.refetch()} size="sm" variant="outline">
                Try again
              </Button>
            </div>
          ) : credentials.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <KeyRound className="size-5" />
              </span>
              <p className="font-medium">No API credentials yet</p>
              <p className="max-w-sm text-muted-foreground text-sm">
                Create a credential when you are ready to connect a trusted backend to the Vortex SDK.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Public key</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map(credential => (
                  <TableRow key={credential.id}>
                    <TableCell>
                      <span className="font-medium">{credential.name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span>{keyPreview(credential.publicKey)}</span>
                        <Button
                          aria-label={`Copy public key for ${credential.name}`}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(credential.publicKey);
                              toast.success("Public key copied");
                            } catch {
                              toast.error("Could not copy the public key");
                            }
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Copy />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={credential.environment === "live" ? "default" : "secondary"}>
                        {formatEnvironment(credential.environment)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={credential.status === "active" ? "default" : "outline"}>
                        {credential.status === "active" ? "Active" : credential.status === "expired" ? "Expired" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(credential.createdAt)}</TableCell>
                    <TableCell>{formatDate(credential.expiresAt)}</TableCell>
                    <TableCell>
                      <div className="grid gap-1 text-xs">
                        <span>Public: {formatDate(credential.publicLastUsedAt)}</span>
                        <span>Secret: {formatDate(credential.secretLastUsedAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {credential.status !== "revoked" && (
                        <Button
                          aria-label={`Revoke ${credential.name}`}
                          onClick={() => setSelected(credential)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <RevokeCredentialDialog credential={selected} onOpenChange={open => !open && setSelected(null)} />
    </>
  );
}

function RevokeCredentialDialog({
  credential,
  onOpenChange
}: {
  credential: ApiCredential | null;
  onOpenChange: (open: boolean) => void;
}) {
  const revoke = useRevokeApiCredential();

  if (!credential) return null;

  const credentialId = credential.id;
  const credentialName = credential.name;

  function revokeCredential() {
    revoke.mutate(credentialId, {
      onError: error => {
        toast.error("Could not revoke the API credential", {
          description: error instanceof Error ? error.message : undefined
        });
      },
      onSuccess: () => {
        toast.success(`${credentialName} revoked`);
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke {credential.name}?</DialogTitle>
          <DialogDescription>
            Requests using this credential will fail immediately. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          For rotation, deploy a replacement credential and verify it works before revoking this one.
        </p>
        <DialogFooter>
          <Button disabled={revoke.isPending} onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={revoke.isPending} onClick={revokeCredential} type="button" variant="destructive">
            <Trash2 />
            {revoke.isPending ? "Revoking..." : "Revoke credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
