import { type QuoteResponse, RampDirection, type RampProcess } from "@vortexfi/shared";
import { type Actor, createActor } from "xstate";
import { TRANSACTIONS_QUERY_KEY } from "@/hooks/useTransactions";
import { notifyTransferCompleted } from "@/lib/notify";
import { queryClient } from "@/lib/queryClient";
import { type TransferContext, type TransferMeta, transferMachine } from "./transfer.machine";

/**
 * App-lifetime transfer actor: the form only sends START and navigates away — polling
 * keeps running here after the form unmounts. Transaction rows come from the backend ramp
 * history, so each status change just invalidates that query to pull the latest.
 */
const LEGACY_TRANSFER_STATE_STORAGE_KEY = "vortex-dashboard-transfer-state";
const TRANSFER_STATE_STORAGE_PREFIX = `${LEGACY_TRANSFER_STATE_STORAGE_KEY}:owner:`;
const TRANSFER_RECOVERY_VERSION = 1;

interface PersistedTransferRecovery {
  meta: TransferMeta;
  ownerProfileId: string;
  quote: QuoteResponse;
  ramp: RampProcess;
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
  return isRecord(quote) &&
    quote.rampType === RampDirection.BUY &&
    isRecord(meta) &&
    meta.ownerProfileId === ownerProfileId &&
    meta.direction === RampDirection.BUY &&
    isRecord(ramp) &&
    ramp.type === RampDirection.BUY &&
    typeof ramp.id === "string"
    ? {
        activeOwnerProfileId: ownerProfileId,
        additionalData: null,
        errorMessage: null,
        lastStatus: null,
        meta: meta as unknown as TransferMeta,
        quote: quote as unknown as QuoteResponse,
        quoteRequest: null,
        ramp: ramp as unknown as RampProcess,
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

function startTransferActor(): Actor<typeof transferMachine> {
  // Ownerless legacy state cannot be attributed safely and must never be adopted.
  localStorage.removeItem(LEGACY_TRANSFER_STATE_STORAGE_KEY);
  return createActor(transferMachine).start();
}

export const transferActor = startTransferActor();

const notifiedRampIds = new Set<string>();

export function canChangeEffectiveIdentity(): boolean {
  const snapshot = transferActor.getSnapshot();
  return !(
    snapshot.matches("CheckingQuote") ||
    snapshot.matches("CheckingBalance") ||
    snapshot.matches("Registering") ||
    snapshot.matches("SigningUserTxs")
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
  localStorage.removeItem(LEGACY_TRANSFER_STATE_STORAGE_KEY);
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
    if (snapshot.matches("AwaitingPayment")) {
      const ownerProfileId = snapshot.context.activeOwnerProfileId;
      const { meta, quote, ramp } = snapshot.context;
      if (!ownerProfileId || meta?.ownerProfileId !== ownerProfileId || !quote || !ramp) {
        return;
      }
      const recovery: PersistedTransferRecovery = {
        meta,
        ownerProfileId,
        quote,
        ramp,
        version: TRANSFER_RECOVERY_VERSION
      };
      localStorage.setItem(storageKey(ownerProfileId), JSON.stringify(recovery));
      refreshTransactions();
    } else if (!snapshot.matches("Starting")) {
      // Keep the AwaitingPayment snapshot through Starting: the user may already have
      // paid, and a reload must bring the instructions back so start can be retried.
      const ownerProfileId = snapshot.context.activeOwnerProfileId;
      if (ownerProfileId) {
        localStorage.removeItem(storageKey(ownerProfileId));
      }
    }
  } catch {
    // Persistence is a non-critical reload recovery aid.
  }
});
