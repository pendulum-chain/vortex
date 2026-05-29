import {beforeEach, describe, expect, it, mock} from "bun:test";
import {EphemeralAccountType} from "@vortexfi/shared";
import {APIError} from "../../errors/api-error";

const STELLAR_ADDR = "GABCD";
const SUBSTRATE_ADDR = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
const EVM_ADDR = "0x1111111111111111111111111111111111111111";

let substrateNonce = 0;
let substrateFree = "0";
let evmNonce = 0;
let stellarAccount: { sequence: string } | null = null;
let evmGetClientShouldThrow = false;

mock.module("@vortexfi/shared", () => {
  const actual = require("@vortexfi/shared");
  return {
    ...actual,
    ApiManager: {
      getInstance: () => ({
        getApi: async (_network: string) => ({
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
        })
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

mock.module("../stellar/loadAccount", () => ({
  loadAccountWithRetry: async (_address: string) => stellarAccount
}));

// Import AFTER mocks are registered so the module picks up the mocked deps.
const { validateEphemeralAccountsFresh } = await import("./ephemeral-freshness");

describe("validateEphemeralAccountsFresh", () => {
  beforeEach(() => {
    substrateNonce = 0;
    substrateFree = "0";
    evmNonce = 0;
    stellarAccount = null;
    evmGetClientShouldThrow = false;
  });

  it("passes when all submitted ephemerals are fresh on every supported network", async () => {
    await expect(
      validateEphemeralAccountsFresh({
        [EphemeralAccountType.EVM]: EVM_ADDR,
        [EphemeralAccountType.Stellar]: STELLAR_ADDR,
        [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR
      })
    ).resolves.toBeUndefined();
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

  it("rejects when Stellar account already exists on-chain", async () => {
    stellarAccount = { sequence: "12345" };
    try {
      await validateEphemeralAccountsFresh({ [EphemeralAccountType.Stellar]: STELLAR_ADDR });
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("already exists");
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
