import type { DomesticFiatAccount } from "@vortexfi/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AlfredpayCorridorId } from "@/domain/fiatAccounts";
import { isApiError } from "@/services/api/api-client";
import { FiatAccountDialog, type FiatAccountDialogView } from "./alfredpay/FiatAccountDialog";

interface PayoutAccountsSectionProps {
  accounts: DomesticFiatAccount[] | undefined;
  canMutate?: boolean;
  corridorId: AlfredpayCorridorId;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

export function PayoutAccountsSection({
  accounts,
  canMutate = true,
  corridorId,
  error,
  isLoading,
  refetch
}: PayoutAccountsSectionProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<FiatAccountDialogView>("list");

  useEffect(() => {
    if (!canMutate) setOpen(false);
  }, [canMutate]);

  function show(nextView: FiatAccountDialogView) {
    setView(nextView);
    setOpen(true);
  }

  if (isLoading) {
    return <p className="w-full text-center text-muted-foreground text-sm">Loading pay-out accounts…</p>;
  }
  if (isApiError(error) && error.status === 404) {
    return (
      <p className="w-full text-center text-muted-foreground text-sm">
        Pay-out setup not available yet — finish verification first.
      </p>
    );
  }
  if (error) {
    return (
      <div className="grid w-full gap-2 text-center">
        <p className="text-muted-foreground text-sm">Couldn't load pay-out accounts.</p>
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
            {canMutate
              ? "Add a pay-out account to enable reception of money through pay-outs. Pay-ins and third-party payments work without one."
              : "No pay-out accounts are registered. This membership has read-only access."}
          </p>
          {canMutate && (
            <Button onClick={() => show("form")} type="button">
              Add pay-out account
            </Button>
          )}
        </>
      ) : (
        <Button onClick={() => show("list")} type="button" variant="outline">
          View pay-out accounts
        </Button>
      )}
      <FiatAccountDialog
        accounts={savedAccounts}
        canMutate={canMutate}
        corridorId={corridorId}
        onOpenChange={setOpen}
        onViewChange={setView}
        open={open}
        view={view}
      />
    </div>
  );
}
