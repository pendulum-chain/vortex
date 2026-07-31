import type { EphemeralAccount } from "@vortexfi/shared";

// Namespaced away from the widget's "rampEphemerals": the two apps were historically
// served on the same origin under /dashboard/, and independent archives prevent either
// application's migrations or retention metadata from corrupting the other's recovery keys.
const RAMP_EPHEMERALS_STORAGE_KEY = "vortex_dashboard_rampEphemerals";
export const TERMINAL_EPHEMERAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface RampEphemeralEntry {
  substrateEphemeral: EphemeralAccount;
  evmEphemeral: EphemeralAccount;
  timestamp: number;
  terminalObservedAt?: number;
}

type RampEphemeralsMap = Record<string, RampEphemeralEntry>;

function writeRampEphemerals(entries: RampEphemeralsMap): void {
  try {
    localStorage.setItem(RAMP_EPHEMERALS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    throw new Error("Unable to preserve ramp recovery keys in this browser. The transfer was not registered.");
  }
}

function readRampEphemerals(now = Date.now()): RampEphemeralsMap {
  const raw = localStorage.getItem(RAMP_EPHEMERALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const entries = JSON.parse(raw) as RampEphemeralsMap;
    let changed = false;
    for (const [rampId, entry] of Object.entries(entries)) {
      if (entry.terminalObservedAt !== undefined && now - entry.terminalObservedAt >= TERMINAL_EPHEMERAL_RETENTION_MS) {
        delete entries[rampId];
        changed = true;
      }
    }
    if (changed) {
      writeRampEphemerals(entries);
    }
    return entries;
  } catch {
    throw new Error("The saved ramp recovery keys are unreadable. Restore or clear them before starting another transfer.");
  }
}

export function storePendingRampEphemerals(
  quoteId: string,
  ephemerals: Pick<RampEphemeralEntry, "evmEphemeral" | "substrateEphemeral">
): void {
  const entries = readRampEphemerals();
  entries[`pending:${quoteId}`] = { ...ephemerals, timestamp: Date.now() };
  writeRampEphemerals(entries);
}

export function bindRampEphemerals(quoteId: string, rampId: string): void {
  const entries = readRampEphemerals();
  const pendingKey = `pending:${quoteId}`;
  const ephemerals = entries[pendingKey];
  if (!ephemerals) {
    throw new Error("Ramp recovery keys are missing. The transfer cannot continue safely.");
  }

  entries[rampId] = ephemerals;
  delete entries[pendingKey];
  writeRampEphemerals(entries);
}

export function markRampEphemeralsTerminal(rampId: string, observedAt = Date.now()): void {
  const entries = readRampEphemerals(observedAt);
  const entry = entries[rampId];
  if (!entry || entry.terminalObservedAt !== undefined) {
    return;
  }
  entry.terminalObservedAt = observedAt;
  writeRampEphemerals(entries);
}

export function getStoredRampEphemerals(now = Date.now()): RampEphemeralsMap {
  return readRampEphemerals(now);
}
