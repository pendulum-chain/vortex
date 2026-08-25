import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { EphemeralAccountType } from "@vortexfi/shared";
import type { StoredEphemeralKey, VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

const RAMP_ID = "ramp_store_test";
const BUILT_IN_FILE = `ephemerals_${RAMP_ID}.json`;

const ephemerals = {
  [EphemeralAccountType.Substrate]: { address: "substrate-address", secret: "substrate-secret" },
  [EphemeralAccountType.EVM]: { address: "evm-address", secret: "evm-secret" },
};

function makeSdk(config: Partial<VortexSdkConfig> = {}): VortexSdk {
  return new VortexSdk({ apiBaseUrl: "http://127.0.0.1:1", ...config });
}

describe("VortexSdk.storeEphemerals", () => {
  test("passes structured items to the callback instead of the built-in storage", async () => {
    const calls: Array<{ keys: StoredEphemeralKey[]; rampId: string }> = [];
    const sdk = makeSdk({
      storeEphemeralKeysCallback: async (keys, rampId) => {
        calls.push({ keys, rampId });
      },
    });

    await sdk.storeEphemerals(ephemerals, RAMP_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0].rampId).toBe(RAMP_ID);
    expect(calls[0].keys).toEqual([
      {
        address: "substrate-address",
        rampId: RAMP_ID,
        secret: "substrate-secret",
        type: EphemeralAccountType.Substrate,
      },
      {
        address: "evm-address",
        rampId: RAMP_ID,
        secret: "evm-secret",
        type: EphemeralAccountType.EVM,
      },
    ]);
    expect(existsSync(BUILT_IN_FILE)).toBe(false);
  });

  test("invokes the callback even when storeEphemeralKeys is false", async () => {
    const calls: StoredEphemeralKey[][] = [];
    const sdk = makeSdk({
      storeEphemeralKeys: false,
      storeEphemeralKeysCallback: async keys => {
        calls.push(keys);
      },
    });

    await sdk.storeEphemerals(ephemerals, RAMP_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
  });

  test("propagates a callback rejection so registration fails closed", async () => {
    const sdk = makeSdk({
      storeEphemeralKeysCallback: async () => {
        throw new Error("vault unavailable");
      },
    });

    await expect(sdk.storeEphemerals(ephemerals, RAMP_ID)).rejects.toThrow("vault unavailable");
  });

  test("stores nothing when storage is disabled and no callback is configured", async () => {
    const sdk = makeSdk({ storeEphemeralKeys: false });

    await sdk.storeEphemerals(ephemerals, RAMP_ID);

    expect(existsSync(BUILT_IN_FILE)).toBe(false);
  });
});
