import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { bindRampEphemerals, getStoredRampEphemerals, storePendingRampEphemerals } from "./rampEphemerals";

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
      "rampEphemerals",
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
});
