import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { TransferForm } from "@/components/transfer/TransferForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CORRIDORS } from "@/domain/corridors";
import { useActiveAccount } from "@/hooks/useActiveAccount";

export const Route = createFileRoute("/_app/transfer")({
  component: TransferPage
});

function TransferPage() {
  const account = useActiveAccount();

  if (!account) {
    return null;
  }

  const approvedCorridors = account.selectedCorridors
    .map(id => CORRIDORS[id])
    .filter(corridor => corridor.availability === "live" && account.onboardings[corridor.id]?.status === "approved");

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">New transfer</h1>
        <p className="text-muted-foreground">Trigger an on-ramp or off-ramp for {account.name}.</p>
      </div>

      {approvedCorridors.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Lock className="size-4" />
            </span>
            <p className="text-muted-foreground">
              Transfers unlock once a corridor's KYB/KYC is approved. Complete onboarding on the Overview page first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transfer details</CardTitle>
          </CardHeader>
          <CardContent>
            <TransferForm account={account} approvedCorridors={approvedCorridors} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
