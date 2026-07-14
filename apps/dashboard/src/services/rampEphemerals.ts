import type { EphemeralAccount } from "@vortexfi/shared";

// Namespaced away from the widget's "rampEphemerals": both apps share the origin (the dashboard
// is served under /dashboard/), and the widget prunes its map to 50 entries — sharing the key
// would let a widget ramp evict an in-flight dashboard ramp's recovery keys.
const RAMP_EPHEMERALS_STORAGE_KEY = "vortex_dashboard_rampEphemerals";

export interface RampEphemeralEntry {
  substrateEphemeral: EphemeralAccount;
  evmEphemeral: EphemeralAccount;
  timestamp: number;
}

type RampEphemeralsMap = Record<string, RampEphemeralEntry>;

function readRampEphemerals(): RampEphemeralsMap {
  const raw = localStorage.getItem(RAMP_EPHEMERALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as RampEphemeralsMap;
  } catch {
    throw new Error("The saved ramp recovery keys are unreadable. Restore or clear them before starting another transfer.");
  }
}

function writeRampEphemerals(entries: RampEphemeralsMap): void {
  try {
    localStorage.setItem(RAMP_EPHEMERALS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    throw new Error("Unable to preserve ramp recovery keys in this browser. The transfer was not registered.");
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

export function getStoredRampEphemerals(): RampEphemeralsMap {
  return readRampEphemerals();
}
