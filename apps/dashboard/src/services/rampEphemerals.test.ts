import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import {
  bindRampEphemerals,
  getStoredRampEphemerals,
  markRampEphemeralsTerminal,
  storePendingRampEphemerals,
  TERMINAL_EPHEMERAL_RETENTION_MS
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
  beforeEach(() => values.clear());

  after(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  });

  it("keeps previous ramp keys when binding a new registered ramp", () => {
    values.set(
      "vortex_dashboard_rampEphemerals",
      JSON.stringify({
        "previous-ramp": {
          evmEphemeral: { address: "0xprevious", secret: "0xprevious-secret" },
          substrateEphemeral: { address: "previous-substrate", secret: "previous mnemonic" },
          timestamp: 1
        }
      })
    );

    storePendingRampEphemerals("quote-id", {
      evmEphemeral: { address: "0xcurrent", secret: "0xcurrent-secret" },
      substrateEphemeral: { address: "current-substrate", secret: "current mnemonic" }
    });
    bindRampEphemerals("quote-id", "current-ramp");

    const stored = getStoredRampEphemerals();
    assert.equal(stored["previous-ramp"]?.evmEphemeral.secret, "0xprevious-secret");
    assert.equal(stored["current-ramp"]?.substrateEphemeral.secret, "current mnemonic");
    assert.equal(stored["pending:quote-id"], undefined);
  });

  it("retains unresolved keys and prunes terminal keys only after 90 days", () => {
    const observedAt = 1_000_000;
    values.set(
      "vortex_dashboard_rampEphemerals",
      JSON.stringify({
        resolved: {
          evmEphemeral: { address: "0xresolved", secret: "0xresolved-secret" },
          substrateEphemeral: { address: "resolved-substrate", secret: "resolved mnemonic" },
          timestamp: 1
        },
        unresolved: {
          evmEphemeral: { address: "0xunresolved", secret: "0xunresolved-secret" },
          substrateEphemeral: { address: "unresolved-substrate", secret: "unresolved mnemonic" },
          timestamp: 1
        }
      })
    );

    markRampEphemeralsTerminal("resolved", observedAt);
    markRampEphemeralsTerminal("resolved", observedAt + 100);

    assert.equal(
      getStoredRampEphemerals(observedAt + TERMINAL_EPHEMERAL_RETENTION_MS - 1).resolved?.terminalObservedAt,
      observedAt
    );
    const afterRetention = getStoredRampEphemerals(observedAt + TERMINAL_EPHEMERAL_RETENTION_MS);
    assert.equal(afterRetention.resolved, undefined);
    assert.equal(afterRetention.unresolved?.evmEphemeral.secret, "0xunresolved-secret");
  });
});
