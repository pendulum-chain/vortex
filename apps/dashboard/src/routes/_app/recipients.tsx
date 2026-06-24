import { createFileRoute } from "@tanstack/react-router";
import { Inbox, Lock } from "lucide-react";
import { RecipientDialog } from "@/components/recipients/RecipientDialog";
import { RecipientsTable } from "@/components/recipients/RecipientsTable";
import { Card, CardContent } from "@/components/ui/card";
import { CORRIDORS } from "@/domain/corridors";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/_app/recipients")({
  component: RecipientsPage
});

function RecipientsPage() {
  const account = useActiveAccount();
  const recipients = useDashboardStore(state => state.recipients);

  if (!account) {
    return null;
  }

  const approvedCorridors = account.selectedCorridors
    .map(id => CORRIDORS[id])
    .filter(corridor => corridor.availability === "live" && account.onboardings[corridor.id]?.status === "approved");
  const accountRecipients = recipients.filter(recipient => recipient.accountId === account.id);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Recipients</h1>
          <p className="text-muted-foreground">Invite recipients to receive transfers from {account.name}.</p>
        </div>
        <RecipientDialog account={account} approvedCorridors={approvedCorridors} />
      </div>

      {approvedCorridors.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Lock className="size-4" />
            </span>
            <p className="text-muted-foreground">
              Inviting recipients unlocks once a corridor's KYB/KYC is approved. Complete onboarding on the Overview page first.
            </p>
          </CardContent>
        </Card>
      )}

      {accountRecipients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-7 text-muted-foreground" />
            <p className="font-medium">No recipients yet</p>
            <p className="text-muted-foreground text-sm">
              {approvedCorridors.length === 0
                ? "Approve a corridor to start inviting recipients."
                : "Invite your first recipient to start transferring."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <RecipientsTable recipients={accountRecipients} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
