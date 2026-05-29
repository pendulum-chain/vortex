import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AssetHubToken, EphemeralAccountType, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import type QuoteTicket from "../../../models/quoteTicket.model";
import { APIError } from "../../errors/api-error";

const STELLAR_ADDR = "GABCD";
const SUBSTRATE_ADDR = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
const EVM_ADDR = "0x1111111111111111111111111111111111111111";

let substrateNonce = 0;
let substrateFree = "0";
let evmNonce = 0;
let evmBalance = 0n;
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
            getBalance: async (_args: { address: string }) => evmBalance,
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
const { getEphemeralNetworksForQuote, validateEphemeralAccountsFresh } = await import("./ephemeral-freshness");

function makeQuote(overrides: Partial<QuoteTicket>): QuoteTicket {
  return {
    from: Networks.Polygon,
    inputCurrency: EvmToken.USDC,
    outputCurrency: FiatToken.BRL,
    rampType: RampDirection.SELL,
    to: Networks.Pendulum,
    ...overrides
  } as unknown as QuoteTicket;
}

describe("getEphemeralNetworksForQuote", () => {
  it("offramp BRL with EVM input → EVM:[Base]", () => {
    const result = getEphemeralNetworksForQuote(
      makeQuote({ from: Networks.Polygon, inputCurrency: EvmToken.USDC, outputCurrency: FiatToken.BRL, rampType: RampDirection.SELL })
    );
    expect(result.evm).toEqual([Networks.Base]);
    expect(result.substrate).toEqual([]);
    expect(result.stellar).toBe(false);
  });

  it("offramp non-BRL non-Monerium → Substrate:[pendulum] + Stellar", () => {
    const result = getEphemeralNetworksForQuote(
      makeQuote({ from: Networks.Polygon, inputCurrency: EvmToken.USDC, outputCurrency: FiatToken.EURC, rampType: RampDirection.SELL })
    );
    expect(result.substrate).toEqual(["pendulum"]);
    expect(result.stellar).toBe(true);
  });

  it("offramp Monerium → no ephemerals required", () => {
    const result = getEphemeralNetworksForQuote(
      makeQuote({ from: Networks.Polygon, inputCurrency: EvmToken.USDC, outputCurrency: FiatToken.EURC, rampType: RampDirection.SELL }),
      { moneriumAuthToken: "tok" }
    );
    expect(result.evm).toEqual([]);
    expect(result.substrate).toEqual([]);
    expect(result.stellar).toBe(false);
  });

  it("onramp BRL → AssetHub non-USDC → EVM:[Moonbeam] + Substrate:[pendulum, hydration]", () => {
    const result = getEphemeralNetworksForQuote(
      makeQuote({
        inputCurrency: FiatToken.BRL,
        outputCurrency: AssetHubToken.DOT,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      })
    );
    expect(result.evm).toEqual([Networks.Moonbeam]);
    expect(result.substrate).toEqual(["pendulum", "hydration"]);
  });
});

describe("validateEphemeralAccountsFresh", () => {
  beforeEach(() => {
    substrateNonce = 0;
    substrateFree = "0";
    evmNonce = 0;
    evmBalance = 0n;
    stellarAccount = null;
    evmGetClientShouldThrow = false;
  });

  it("passes when all ephemerals are fresh", async () => {
    await expect(
      validateEphemeralAccountsFresh(
        { [EphemeralAccountType.EVM]: EVM_ADDR, [EphemeralAccountType.Stellar]: STELLAR_ADDR, [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
        { evm: [Networks.Base], stellar: true, substrate: ["pendulum"] }
      )
    ).resolves.toBeUndefined();
  });

  it("rejects non-fresh Substrate (non-zero nonce)", async () => {
    substrateNonce = 1;
    try {
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
        { evm: [], stellar: false, substrate: ["pendulum"] }
      );
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
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
        { evm: [], stellar: false, substrate: ["pendulum"] }
      );
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
    }
  });

  it("rejects non-fresh EVM (non-zero nonce)", async () => {
    evmNonce = 5;
    try {
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.EVM]: EVM_ADDR },
        { evm: [Networks.Base], stellar: false, substrate: [] }
      );
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("not fresh");
    }
  });

  it("rejects non-fresh EVM (non-zero balance)", async () => {
    evmBalance = 1000000000000000n;
    try {
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.EVM]: EVM_ADDR },
        { evm: [Networks.Base], stellar: false, substrate: [] }
      );
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("not fresh");
    }
  });

  it("rejects when Stellar account already exists on-chain", async () => {
    stellarAccount = { sequence: "12345" };
    try {
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.Stellar]: STELLAR_ADDR },
        { evm: [], stellar: true, substrate: [] }
      );
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("already exists");
    }
  });

  it("rejects when a route-required ephemeral is missing", async () => {
    try {
      await validateEphemeralAccountsFresh({}, { evm: [Networks.Base], stellar: false, substrate: [] });
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(400);
      expect((err as APIError).message).toContain("required");
    }
  });

  it("fails closed with SERVICE_UNAVAILABLE on RPC error", async () => {
    evmGetClientShouldThrow = true;
    try {
      await validateEphemeralAccountsFresh(
        { [EphemeralAccountType.EVM]: EVM_ADDR },
        { evm: [Networks.Base], stellar: false, substrate: [] }
      );
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as APIError).status).toBe(503);
    }
  });
});
