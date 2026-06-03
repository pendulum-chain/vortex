// Regression coverage for the Alfredpay (USD / MXN / COP) on/off-ramp flows.
// Exercises the real AlfredpayHandler against an in-memory backend (no network,
// RPC, KYC, or on-chain funds) to lock in routing, request payloads, and call
// ordering. Run: cd packages/sdk && bun test

import { describe, expect, test } from "bun:test";
import { FiatToken, isAlfredpayToken } from "@vortexfi/shared";
import { MissingAlfredpayOfframpParametersError, MissingAlfredpayOnrampParametersError } from "../src/errors";
import { AlfredpayHandler } from "../src/handlers/AlfredpayHandler";

const WALLET = "0x1234567890123456789012345678901234567890";
const FIAT_ACCOUNT = "fa_demo";

type Call = { method: string; payload: any };

function setup(overrides: { unsignedTxs?: any[]; currentPhase?: string } = {}) {
  const calls: Call[] = [];
  const unsignedTxs = overrides.unsignedTxs ?? [];

  const apiService = {
    getRampStatus: async (id: string) => {
      calls.push({ method: "getRampStatus", payload: id });
      return { currentPhase: overrides.currentPhase ?? "initial", id, unsignedTxs };
    },
    registerRamp: async (req: any) => {
      calls.push({ method: "registerRamp", payload: req });
      return { currentPhase: "initial", id: "ramp_1", unsignedTxs };
    },
    updateRamp: async (req: any) => {
      calls.push({ method: "updateRamp", payload: req });
      return { currentPhase: "initial", id: req.rampId, unsignedTxs };
    }
  };

  const context = {
    storeEphemerals: async (...args: any[]) => {
      calls.push({ method: "storeEphemerals", payload: args });
    }
  };

  const generateEphemerals = async () => ({
    accountMetas: [
      { address: "GSTELLAR", type: "Stellar" },
      { address: "5SUBSTRATE", type: "Substrate" },
      { address: "0xEVM", type: "EVM" }
    ],
    ephemerals: {
      EVM: { address: "0xEVM", secret: "s" },
      Stellar: { address: "GSTELLAR", secret: "s" },
      Substrate: { address: "5SUBSTRATE", secret: "s" }
    }
  });

  const signTransactions = async (txs: any[]) => {
    calls.push({ method: "signTransactions", payload: txs });
    return txs.map((_t, i) => ({ id: `presigned_${i}` }));
  };

  const handler = new AlfredpayHandler(apiService as any, context as any, generateEphemerals as any, signTransactions as any);
  return { calls, handler };
}

describe("isAlfredpayToken routing", () => {
  test("USD/MXN/COP route to Alfredpay", () => {
    for (const t of [FiatToken.USD, FiatToken.MXN, FiatToken.COP]) {
      expect(isAlfredpayToken(t)).toBe(true);
    }
  });

  test("BRL/EURC/ARS do not route to Alfredpay", () => {
    for (const t of [FiatToken.BRL, FiatToken.EURC, FiatToken.ARS]) {
      expect(isAlfredpayToken(t)).toBe(false);
    }
  });
});

describe("AlfredpayHandler onramp", () => {
  test("registers, stores ephemerals, signs, then updates", async () => {
    const { calls, handler } = setup({ unsignedTxs: [{ phase: "fundEphemeral", signer: "5SUBSTRATE" }] });

    const result = await handler.registerAlfredpayOnramp("quote_1", {
      destinationAddress: WALLET,
      fiatAccountId: FIAT_ACCOUNT,
      walletAddress: WALLET
    });

    expect(result.id).toBe("ramp_1");
    expect(calls.map(c => c.method)).toEqual(["registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);

    const reg = calls.find(c => c.method === "registerRamp")!.payload;
    expect(reg.quoteId).toBe("quote_1");
    expect(reg.additionalData.destinationAddress).toBe(WALLET);
    expect(reg.additionalData.fiatAccountId).toBe(FIAT_ACCOUNT);
    expect(reg.signingAccounts).toHaveLength(3);

    const upd = calls.find(c => c.method === "updateRamp")!.payload;
    expect(upd.presignedTxs).toHaveLength(1);
    expect(upd.additionalData).toEqual({});
  });

  test("throws when destinationAddress missing", async () => {
    const { handler } = setup();
    await expect(
      handler.registerAlfredpayOnramp("q", { destinationAddress: "", fiatAccountId: FIAT_ACCOUNT } as any)
    ).rejects.toBeInstanceOf(MissingAlfredpayOnrampParametersError);
  });

  test("throws when fiatAccountId missing", async () => {
    const { handler } = setup();
    await expect(
      handler.registerAlfredpayOnramp("q", { destinationAddress: WALLET, fiatAccountId: "" } as any)
    ).rejects.toBeInstanceOf(MissingAlfredpayOnrampParametersError);
  });
});

describe("AlfredpayHandler offramp", () => {
  test("registers with fiatAccountId + walletAddress (no destinationAddress)", async () => {
    const { calls, handler } = setup({ unsignedTxs: [{ phase: "squidRouterApprove", signer: WALLET }] });

    const result = await handler.registerAlfredpayOfframp("quote_2", { fiatAccountId: FIAT_ACCOUNT, walletAddress: WALLET });

    expect(result.id).toBe("ramp_1");
    expect(calls.map(c => c.method)).toEqual(["registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);

    const reg = calls.find(c => c.method === "registerRamp")!.payload;
    expect(reg.additionalData.fiatAccountId).toBe(FIAT_ACCOUNT);
    expect(reg.additionalData.walletAddress).toBe(WALLET);
    expect(reg.additionalData.destinationAddress).toBeUndefined();
  });

  test("throws when fiatAccountId missing", async () => {
    const { handler } = setup();
    await expect(
      handler.registerAlfredpayOfframp("q", { fiatAccountId: "", walletAddress: WALLET } as any)
    ).rejects.toBeInstanceOf(MissingAlfredpayOfframpParametersError);
  });

  test("throws when walletAddress missing", async () => {
    const { handler } = setup();
    await expect(
      handler.registerAlfredpayOfframp("q", { fiatAccountId: FIAT_ACCOUNT, walletAddress: "" } as any)
    ).rejects.toBeInstanceOf(MissingAlfredpayOfframpParametersError);
  });
});

describe("AlfredpayHandler offramp update", () => {
  test("forwards squidRouter hashes with no presignedTxs after phase check", async () => {
    const { calls, handler } = setup({ currentPhase: "initial" });

    await handler.updateAlfredpayOfframp("ramp_1", { squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" });

    expect(calls.map(c => c.method)).toEqual(["getRampStatus", "updateRamp"]);
    const upd = calls.find(c => c.method === "updateRamp")!.payload;
    expect(upd.additionalData.squidRouterApproveHash).toBe("0xA");
    expect(upd.additionalData.squidRouterSwapHash).toBe("0xS");
    expect(upd.presignedTxs).toHaveLength(0);
  });

  test("throws when ramp is not on the initial phase", async () => {
    const { handler } = setup({ currentPhase: "started" });
    await expect(handler.updateAlfredpayOfframp("ramp_1", {})).rejects.toThrow(/initial phase/);
  });
});
