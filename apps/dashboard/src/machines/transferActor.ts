import { createActor } from "xstate";
import { notifyTransferCompleted } from "@/lib/notify";
import { mapPhaseToStatus } from "@/services/api/ramp.service";
import { useDashboardStore } from "@/stores/dashboard.store";
import { transferMachine } from "./transfer.machine";

/**
 * App-lifetime transfer actor: the form only sends START and navigates away — polling
 * and transactions-table updates keep running here after the form unmounts.
 */
export const transferActor = createActor(transferMachine);

// One dashboard transaction row per ramp, created when tracking starts.
const txIdByRampId = new Map<string, string>();
const notifiedRampIds = new Set<string>();

transferActor.on("TRACKING_STARTED", event => {
  const store = useDashboardStore.getState();
  const { summary: _summary, ...transaction } = event.meta;
  const txId = store.addTransaction({
    ...transaction,
    payinWallet: event.ramp.walletAddress ?? "",
    status: "awaiting_payin"
  });
  txIdByRampId.set(event.ramp.id, txId);
});

transferActor.on("STATUS_CHANGED", event => {
  const txId = txIdByRampId.get(event.ramp.id);
  if (!txId) {
    return;
  }
  const status = mapPhaseToStatus(event.status.currentPhase);
  useDashboardStore.getState().setTransactionStatus(txId, status);
  if (status === "completed" && !notifiedRampIds.has(event.ramp.id)) {
    notifiedRampIds.add(event.ramp.id);
    const meta = transferActor.getSnapshot().context.meta;
    notifyTransferCompleted(meta ? `Payout of ${meta.summary}` : "Payout completed");
  }
});

transferActor.start();
