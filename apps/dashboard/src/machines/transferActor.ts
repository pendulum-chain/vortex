import { createActor } from "xstate";
import { TRANSACTIONS_QUERY_KEY } from "@/hooks/useTransactions";
import { notifyTransferCompleted } from "@/lib/notify";
import { queryClient } from "@/lib/queryClient";
import { transferMachine } from "./transfer.machine";

/**
 * App-lifetime transfer actor: the form only sends START and navigates away — polling
 * keeps running here after the form unmounts. Transaction rows come from the backend ramp
 * history, so each status change just invalidates that query to pull the latest.
 */
export const transferActor = createActor(transferMachine);

const notifiedRampIds = new Set<string>();

export function resetTransferState() {
  notifiedRampIds.clear();
  transferActor.send({ type: "RESET" });
}

function refreshTransactions() {
  queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
}

transferActor.on("TRACKING_STARTED", refreshTransactions);

transferActor.on("STATUS_CHANGED", event => {
  refreshTransactions();
  if (event.status.currentPhase === "complete" && !notifiedRampIds.has(event.ramp.id)) {
    notifiedRampIds.add(event.ramp.id);
    const meta = transferActor.getSnapshot().context.meta;
    notifyTransferCompleted(meta ? `Payout of ${meta.summary}` : "Payout completed");
  }
});

transferActor.start();
