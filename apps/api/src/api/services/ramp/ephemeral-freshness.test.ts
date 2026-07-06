import {afterAll, beforeEach, describe, expect, it, mock} from "bun:test";
import {EphemeralAccountType} from "@vortexfi/shared";
import * as sharedNamespace from "@vortexfi/shared";
import {APIError} from "../../errors/api-error";

// Value copy taken before mock.module runs; restored in afterAll because bun
// module mocks are process-wide and would poison later test files.
const sharedReal = { ...sharedNamespace };

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

const SUBSTRATE_ADDR = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
const EVM_ADDR = "0x1111111111111111111111111111111111111111";

let substrateNonce = 0;
let substrateFree = "0";
let checkedSubstrateNetworks: string[] = [];
let evmNonce = 0;
let evmGetClientShouldThrow = false;

mock.module("@vortexfi/shared", () => {
  const actual = require("@vortexfi/shared");
  return {
    ...actual,
    ApiManager: {
      getInstance: () => ({
        getApi: async (network: string) => {
          checkedSubstrateNetworks.push(network);

          return {
            api: {
              query: {
                system: {
                  account: async (_address: string) => ({
                    data: { free: { toString: () => substrateFree } },
                    nonce: { toNumber: () => substrateNonce }
                  })
                }
              }
            }
          };
        }
      })
    },
    EvmClientManager: {
      getInstance: () => ({
        getClient: (_network: string) => {
          if (evmGetClientShouldThrow) throw new Error("RPC down");
          return {
            getTransactionCount: async (_args: { address: string }) => evmNonce
          };
        }
      })
    }
  };
});

// Import AFTER mocks are registered so the module picks up the mocked deps.
const { validateEphemeralAccountsFresh } = await import("./ephemeral-freshness");

describe("validateEphemeralAccountsFresh", () => {
  beforeEach(() => {
    substrateNonce = 0;
    substrateFree = "0";
    checkedSubstrateNetworks = [];
    evmNonce = 0;
    evmGetClientShouldThrow = false;
  });

  it("passes when all submitted ephemerals are fresh on every supported network", async () => {
    await expect(
      validateEphemeralAccountsFresh({
        [EphemeralAccountType.EVM]: EVM_ADDR,
        [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR
      })
    ).resolves.toBeUndefined();
  });

  it("does not check Hydration while Hydration-backed routes are disabled", async () => {
    await validateEphemeralAccountsFresh({ [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR });

    expect(checkedSubstrateNetworks).toEqual(["pendulum", "assethub"]);
  });

  it("passes when no ephemerals are submitted", async () => {
    await expect(validateEphemeralAccountsFresh({})).resolves.toBeUndefined();
  });

  it("rejects non-fresh Substrate (non-zero nonce)", async () => {
    substrateNonce = 1;
    try {
      await validateEphemeralAccountsFresh({ [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR });
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(APIError);
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("not fresh");
    }
  });

  it("rejects non-fresh Substrate (non-zero free balance)", async () => {
    substrateFree = "1000";
    try {
      await validateEphemeralAccountsFresh({ [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR });
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
    }
  });

  it("rejects non-fresh EVM (non-zero nonce)", async () => {
    evmNonce = 5;
    try {
      await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR });
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("not fresh");
    }
  });

  it("fails closed with SERVICE_UNAVAILABLE on RPC error", async () => {
    evmGetClientShouldThrow = true;
    try {
      await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR });
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(503);
    }
  });
});
