import type { EphemeralAccount } from "@vortexfi/shared";
import type { RampExecutionInput } from "../types/phases";

const RAMP_EPHEMERALS_STORAGE_KEY = "rampEphemerals";
export const TERMINAL_EPHEMERAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type RampEphemeralEntry = {
  substrateEphemeral: EphemeralAccount;
  evmEphemeral: EphemeralAccount;
  timestamp?: number;
  terminalObservedAt?: number;
};

export type RampEphemeralsMap = Record<string, RampEphemeralEntry>;

function writeRampEphemerals(entries: RampEphemeralsMap): void {
  localStorage.setItem(RAMP_EPHEMERALS_STORAGE_KEY, JSON.stringify(entries));
}

function pruneExpiredTerminalEntries(entries: RampEphemeralsMap, now: number): boolean {
  let changed = false;
  for (const [rampId, entry] of Object.entries(entries)) {
    if (entry.terminalObservedAt !== undefined && now - entry.terminalObservedAt >= TERMINAL_EPHEMERAL_RETENTION_MS) {
      delete entries[rampId];
      changed = true;
    }
  }
  return changed;
}

export function readRampEphemerals(now = Date.now()): RampEphemeralsMap {
  try {
    const raw = localStorage.getItem(RAMP_EPHEMERALS_STORAGE_KEY);
    const entries = raw ? (JSON.parse(raw) as RampEphemeralsMap) : {};
    if (pruneExpiredTerminalEntries(entries, now)) {
      writeRampEphemerals(entries);
    }
    return entries;
  } catch {
    return {};
  }
}

export function updateRampEphemeral(rampId: string, ephemerals: RampExecutionInput["ephemerals"]): void {
  try {
    const existing = readRampEphemerals();
    existing[rampId] = {
      ...ephemerals,
      terminalObservedAt: existing[rampId]?.terminalObservedAt,
      timestamp: existing[rampId]?.timestamp ?? Date.now()
    };
    writeRampEphemerals(existing);
  } catch {
    // localStorage may be full or unavailable — non-critical backup
  }
}

export function markRampEphemeralsTerminal(rampId: string, observedAt = Date.now()): void {
  try {
    const existing = readRampEphemerals(observedAt);
    const entry = existing[rampId];
    if (!entry || entry.terminalObservedAt !== undefined) {
      return;
    }
    entry.terminalObservedAt = observedAt;
    writeRampEphemerals(existing);
  } catch {
    // localStorage may be full or unavailable — non-critical backup
  }
}

export function removeRampEphemeral(rampId: string): void {
  try {
    const existing = readRampEphemerals();
    delete existing[rampId];
    writeRampEphemerals(existing);
  } catch {
    // non-critical
  }
}
