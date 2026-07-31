import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  markRampEphemeralsTerminal,
  readRampEphemerals,
  TERMINAL_EPHEMERAL_RETENTION_MS,
  updateRampEphemeral
} from "./rampEphemerals";

const originalLocalStorage = globalThis.localStorage;
const values = new Map<string, string>();
const localStorageMock: Storage = {
  clear: () => values.clear(),
  getItem: key => values.get(key) ?? null,
  key: index => [...values.keys()][index] ?? null,
  get length() {
    return values.size;
  },
  removeItem: key => values.delete(key),
  setItem: (key, value) => values.set(key, value)
};

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageMock });

describe("ramp ephemeral storage", () => {
  beforeEach(() => localStorage.clear());
  afterAll(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  });

  it("migrates legacy entries and retains unresolved ramps indefinitely", () => {
    localStorage.setItem(
      "rampEphemerals",
      JSON.stringify({
        legacy: {
          evmEphemeral: { address: "0xlegacy", secret: "0xlegacy-secret" },
          substrateEphemeral: { address: "legacy-substrate", secret: "legacy mnemonic" },
          timestamp: 1
        }
      })
    );

    expect(readRampEphemerals(Number.MAX_SAFE_INTEGER).legacy?.evmEphemeral.secret).toBe("0xlegacy-secret");
  });

  it("prunes a terminal ramp after 90 days but preserves its original terminal timestamp", () => {
    const observedAt = 1_000_000;
    updateRampEphemeral("ramp-id", {
      evmEphemeral: { address: "0xcurrent", secret: "0xcurrent-secret" },
      substrateEphemeral: { address: "current-substrate", secret: "current mnemonic" }
    });

    markRampEphemeralsTerminal("ramp-id", observedAt);
    markRampEphemeralsTerminal("ramp-id", observedAt + 100);

    expect(readRampEphemerals(observedAt + TERMINAL_EPHEMERAL_RETENTION_MS - 1)["ramp-id"]?.terminalObservedAt).toBe(
      observedAt
    );
    expect(readRampEphemerals(observedAt + TERMINAL_EPHEMERAL_RETENTION_MS)["ramp-id"]).toBeUndefined();
  });
});
