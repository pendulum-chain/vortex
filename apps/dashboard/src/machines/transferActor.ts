import { type QuoteResponse, RampDirection, type RampProcess } from "@vortexfi/shared";
import { createActor } from "xstate";
import { TRANSACTIONS_QUERY_KEY } from "@/hooks/useTransactions";
import { notifyTransferCompleted } from "@/lib/notify";
import { queryClient } from "@/lib/queryClient";
import type { UserTxSubmission } from "./transfer.actors";
import { type TransferContext, type TransferMeta, transferMachine } from "./transfer.machine";

/**
 * App-lifetime transfer actor: the form only sends START and navigates away — polling
 * keeps running here after the form unmounts. Transaction rows come from the backend ramp
 * history, so each status change just invalidates that query to pull the latest.
 */
const TRANSFER_STATE_STORAGE_PREFIX = "vortex-dashboard-transfer-state:owner:";
const TRANSFER_RECOVERY_VERSION = 1;

interface PersistedTransferRecovery {
  meta: TransferMeta;
  ownerProfileId: string;
  quote: QuoteResponse;
  ramp: RampProcess;
  /** Offramp only: wallet output still owed to /ramp/update. Absent in BUY snapshots. */
  userTxSubmission?: UserTxSubmission | null;
  version: typeof TRANSFER_RECOVERY_VERSION;
}

function storageKey(ownerProfileId: string): string {
  return `${TRANSFER_STATE_STORAGE_PREFIX}${encodeURIComponent(ownerProfileId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recoveryContext(value: Record<string, unknown>, ownerProfileId: string): TransferContext | undefined {
  const quote = value.quote;
  const meta = value.meta;
  const ramp = value.ramp;
  const submission = value.userTxSubmission ?? null;
  const direction = isRecord(quote) ? quote.rampType : undefined;
  return (direction === RampDirection.BUY || direction === RampDirection.SELL) &&
    isRecord(meta) &&
    meta.ownerProfileId === ownerProfileId &&
    meta.direction === direction &&
    isRecord(ramp) &&
    ramp.type === direction &&
    typeof ramp.id === "string" &&
    (submission === null ||
      (direction === RampDirection.SELL &&
        isRecord(submission) &&
        Array.isArray(submission.signedTxs) &&
        isRecord(submission.additionalData)))
    ? {
        activeOwnerProfileId: ownerProfileId,
        additionalData: null,
        errorMessage: null,
        lastStatus: null,
        meta: meta as unknown as TransferMeta,
        quote: quote as unknown as QuoteResponse,
        quoteRequest: null,
        ramp: ramp as unknown as RampProcess,
        userTxSubmission: submission as UserTxSubmission | null,
        userTxs: []
      }
    : undefined;
}

function readPersistedTransferState(ownerProfileId: string): TransferContext | undefined {
  const key = storageKey(ownerProfileId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && parsed.version === TRANSFER_RECOVERY_VERSION && parsed.ownerProfileId === ownerProfileId) {
      const context = recoveryContext(parsed, ownerProfileId);
      if (context) {
        return context;
      }
    }
    localStorage.removeItem(key);
    return undefined;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

export const transferActor = createActor(transferMachine).start();

const notifiedRampIds = new Set<string>();

export function canChangeEffectiveIdentity(): boolean {
  const snapshot = transferActor.getSnapshot();
  return !(
    snapshot.matches("CheckingQuote") ||
    snapshot.matches("CheckingBalance") ||
    snapshot.matches("Registering") ||
    snapshot.matches("SigningUserTxs") ||
    snapshot.matches("SubmittingUserTxs")
  );
}

export function activateTransferOwner(ownerProfileId: string): boolean {
  if (!canChangeEffectiveIdentity()) {
    return false;
  }

  const current = transferActor.getSnapshot();
  if (current.context.activeOwnerProfileId === ownerProfileId) {
    return true;
  }

  const persisted = readPersistedTransferState(ownerProfileId);
  transferActor.send({
    ownerProfileId,
    recovery: persisted ?? null,
    type: "ACTIVATE_OWNER"
  });
  return true;
}

export function clearAllTransferRecovery(): void {
  notifiedRampIds.clear();
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(TRANSFER_STATE_STORAGE_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
  transferActor.send({ type: "RESET" });
}

export function resetTransferState(): void {
  const ownerProfileId = transferActor.getSnapshot().context.activeOwnerProfileId;
  notifiedRampIds.clear();
  if (ownerProfileId) {
    localStorage.removeItem(storageKey(ownerProfileId));
  }
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
    const label = meta?.direction === RampDirection.BUY ? "Pay-in" : "Pay-out";
    notifyTransferCompleted(meta ? `${label} of ${meta.summary}` : "Transfer completed");
  }
});

transferActor.subscribe(snapshot => {
  try {
    // A BUY user may already have paid, and a SELL user's wallet has already broadcast, so from
    // here until tracking a reload must bring the ramp back (and an offramp's unsubmitted wallet
    // output) so update/start can be retried.
    if (
      snapshot.matches("AwaitingPayment") ||
      snapshot.matches("SubmittingUserTxs") ||
      snapshot.matches("Starting") ||
      snapshot.matches("AwaitingRetry")
    ) {
      const ownerProfileId = snapshot.context.activeOwnerProfileId;
      const { meta, quote, ramp, userTxSubmission } = snapshot.context;
      if (!ownerProfileId || meta?.ownerProfileId !== ownerProfileId || !quote || !ramp) {
        return;
      }
      const recovery: PersistedTransferRecovery = {
        meta,
        ownerProfileId,
        quote,
        ramp,
        userTxSubmission,
        version: TRANSFER_RECOVERY_VERSION
      };
      localStorage.setItem(storageKey(ownerProfileId), JSON.stringify(recovery));
      refreshTransactions();
    } else {
      const ownerProfileId = snapshot.context.activeOwnerProfileId;
      if (ownerProfileId) {
        localStorage.removeItem(storageKey(ownerProfileId));
      }
    }
  } catch {
    // Persistence is a non-critical reload recovery aid.
  }
});
