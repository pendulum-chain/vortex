import { RampDirection } from "@vortexfi/shared";
import { type Actor, createActor, type Snapshot } from "xstate";
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
    // Only AwaitingPayment is safe to resume: restoring an in-flight promise state
    // (Registering/SigningUserTxs/Starting) would re-run its side effect on reload.
    const parsed = JSON.parse(raw);
    return parsed?.status === "active" && parsed?.value === "AwaitingPayment" ? parsed : undefined;
  } catch {
    localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
    return undefined;
  }
}

function startTransferActor(): Actor<typeof transferMachine> {
  const snapshot = readPersistedTransferState();
  if (snapshot) {
    try {
      return createActor(transferMachine, { snapshot }).start();
    } catch {
      // A snapshot from an older machine shape must not brick the app — drop it.
      localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
    }
  }
  return createActor(transferMachine).start();
}

export const transferActor = startTransferActor();

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
    const label = meta?.direction === RampDirection.BUY ? "Onramp" : "Payout";
    notifyTransferCompleted(meta ? `${label} of ${meta.summary}` : "Transfer completed");
  }
});

transferActor.subscribe(snapshot => {
  try {
    if (snapshot.matches("AwaitingPayment")) {
      localStorage.setItem(TRANSFER_STATE_STORAGE_KEY, JSON.stringify(transferActor.getPersistedSnapshot()));
    } else if (!snapshot.matches("Starting")) {
      // Keep the AwaitingPayment snapshot through Starting: the user may already have
      // paid, and a reload must bring the instructions back so start can be retried.
      localStorage.removeItem(TRANSFER_STATE_STORAGE_KEY);
    }
  } catch {
    // Persistence is a non-critical reload recovery aid.
  }
});
