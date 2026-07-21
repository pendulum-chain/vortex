import { createActor, type Snapshot } from "xstate";
import { TRANSACTIONS_QUERY_KEY } from "@/hooks/useTransactions";
import { notifyTransferCompleted } from "@/lib/notify";
import { queryClient } from "@/lib/queryClient";
import { transferMachine } from "./transfer.machine";

/**
 * App-lifetime transfer actor: the form only sends START and navigates away — polling
 * keeps running here after the form unmounts. Transaction rows come from the backend ramp
 * history, so each status change just invalidates that query to pull the latest.
 */
const TRANSFER_STATE_STORAGE_KEY = "vortex-dashboard-transfer-state";

function readPersistedTransferState(): Snapshot<unknown> | undefined {
  try {
    const raw = localStorage.getItem(TRANSFER_STATE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw);
    return parsed?.status === "error" ? undefined : parsed;
  } catch {
    localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
    return undefined;
  }
}

export const transferActor = createActor(transferMachine, { snapshot: readPersistedTransferState() });

const notifiedRampIds = new Set<string>();

export function resetTransferState() {
  notifiedRampIds.clear();
  localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
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

transferActor.subscribe(snapshot => {
  try {
    if (snapshot.matches("Idle")) {
      localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(TRANSFER_STATE_STORAGE_KEY, JSON.stringify(transferActor.getPersistedSnapshot()));
  } catch {
    // Persistence is a non-critical reload recovery aid.
  }
});

transferActor.start();
