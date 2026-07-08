import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Users } from "lucide-react";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { RecipientDialog } from "@/components/recipients/RecipientDialog";
import { RecipientsTable } from "@/components/recipients/RecipientsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CORRIDORS } from "@/domain/corridors";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useRecipients } from "@/hooks/useRecipients";
import { popIn } from "@/lib/motion";

export const Route = createFileRoute("/_app/recipients")({
  component: RecipientsPage
});

function RecipientsPage() {
  const account = useActiveAccount();
  const { recipients: accountRecipients, approvedCorridors: approvedIds } = useRecipients(account);

  if (!account) {
    return null;
  }

  const approvedCorridors = [...approvedIds].map(id => CORRIDORS[id]).filter(corridor => corridor.availability === "live");

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-balance font-semibold text-2xl tracking-tight">Recipients</h1>
          <p className="text-muted-foreground">
            Add recipients and share an invite link so they complete KYC/KYB for {account.name}.
          </p>
        </div>
        <RecipientDialog account={account} approvedCorridors={approvedCorridors} />
      </StaggerItem>

      {approvedCorridors.length === 0 ? (
        <StaggerItem>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <motion.span
                animate="show"
                className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
                initial="hidden"
                variants={popIn}
              >
                <Lock className="size-5" />
              </motion.span>
              <div className="grid gap-1">
                <p className="font-medium">Recipients are locked</p>
                <p className="text-pretty text-muted-foreground text-sm">
                  Adding recipients unlocks once a corridor's KYB/KYC is approved. Complete onboarding first.
                </p>
              </div>
              <Button asChild>
                <Link to="/overview">
                  Go to Onboarding
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      ) : accountRecipients.length === 0 ? (
        <StaggerItem>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <motion.span
                animate="show"
                className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
                initial="hidden"
                variants={popIn}
              >
                <Users className="size-5" />
              </motion.span>
              <div className="grid gap-1">
                <p className="font-medium">No recipients yet</p>
                <p className="text-pretty text-muted-foreground text-sm">
                  Add a recipient and share their invite link — they complete KYC/KYB and add payout details to receive
                  transfers.
                </p>
              </div>
              <RecipientDialog account={account} approvedCorridors={approvedCorridors} />
            </CardContent>
          </Card>
        </StaggerItem>
      ) : (
        <StaggerItem>
          <Card>
            <CardContent>
              <RecipientsTable recipients={accountRecipients} />
            </CardContent>
          </Card>
        </StaggerItem>
      )}
    </Stagger>
  );
}
