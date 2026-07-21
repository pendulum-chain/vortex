import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AlfredpayCorridorId } from "@/domain/fiatAccounts";
import { isApiError } from "@/services/api/api-client";
import { FiatAccountDialog, type FiatAccountDialogView } from "./alfredpay/FiatAccountDialog";

interface PayoutAccountsSectionProps {
  accounts: AlfredpayFiatAccount[] | undefined;
  corridorId: AlfredpayCorridorId;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

export function PayoutAccountsSection({ accounts, corridorId, error, isLoading, refetch }: PayoutAccountsSectionProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<FiatAccountDialogView>("list");

  function show(nextView: FiatAccountDialogView) {
    setView(nextView);
    setOpen(true);
  }

  if (isLoading) {
    return <p className="w-full text-center text-muted-foreground text-sm">Loading payout accounts…</p>;
  }
  if (isApiError(error) && error.status === 404) {
    return (
      <p className="w-full text-center text-muted-foreground text-sm">
        Payout setup not available yet — finish verification first.
      </p>
    );
  }
  if (error) {
    return (
      <div className="grid w-full gap-2 text-center">
        <p className="text-muted-foreground text-sm">Couldn't load payout accounts.</p>
        <Button onClick={refetch} size="sm" type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const savedAccounts = accounts ?? [];
  return (
    <div className="grid w-full gap-2">
      {savedAccounts.length === 0 ? (
        <>
          <p className="text-muted-foreground text-xs">
            Add a payout account to enable reception of money through offramps. Onramps and third-party payments work without
            one.
          </p>
          <Button onClick={() => show("form")} type="button">
            Add payout account
          </Button>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-success">
            Verification complete · {savedAccounts.length} payout account{savedAccounts.length === 1 ? "" : "s"}
          </p>
          <Button onClick={() => show("list")} type="button" variant="outline">
            View payout accounts
          </Button>
        </>
      )}
      <FiatAccountDialog
        accounts={savedAccounts}
        corridorId={corridorId}
        onOpenChange={setOpen}
        onViewChange={setView}
        open={open}
        view={view}
      />
    </div>
  );
}
