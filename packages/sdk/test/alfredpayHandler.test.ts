// Regression coverage for the Alfredpay (USD / MXN / COP / ARS) on/off-ramp flows.
// Exercises the real AlfredpayHandler against an in-memory backend (no network,
// RPC, KYC, or on-chain funds) to lock in routing, request payloads, and call
// ordering. Run: cd packages/sdk && bun test

import { describe, expect, test } from "bun:test";
import {
  EPaymentMethod,
  EphemeralAccountType,
  FiatToken,
  GetRampStatusResponse,
  isAlfredpayToken,
  Networks,
  PresignedTx,
  RampDirection,
  RampProcess,
  RegisterRampRequest,
  UpdateRampRequest,
  UnsignedTx
} from "@vortexfi/shared";
import { MissingAlfredpayOfframpParametersError, MissingAlfredpayOnrampParametersError } from "../src/errors";
import { AlfredpayHandler } from "../src/handlers/AlfredpayHandler";
import { ApiService } from "../src/services/ApiService";
import type { VortexSdkContext } from "../src/types";

const WALLET = "0x1234567890123456789012345678901234567890";
const FIAT_ACCOUNT = "fa_demo";

type Call = { method: string; payload: unknown };

const makeUnsignedTx = (phase: UnsignedTx["phase"], signer: string): UnsignedTx => ({
  meta: {},
  network: Networks.Polygon,
  nonce: 0,
  phase,
  signer,
  txData: {
    data: "0x",
    gas: "21000",
    to: "0x0000000000000000000000000000000000000001",
    value: "0"
  }
});

const makeRampProcess = (
  id: string,
  currentPhase: RampProcess["currentPhase"],
  unsignedTxs: UnsignedTx[]
): RampProcess => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  currentPhase,
  from: EPaymentMethod.ACH,
  id,
  inputAmount: "100",
  inputCurrency: FiatToken.USD,
  outputAmount: "10",
  outputCurrency: "USDC",
  paymentMethod: EPaymentMethod.ACH,
  quoteId: "quote_1",
  to: Networks.Polygon,
  type: RampDirection.BUY,
  unsignedTxs,
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const makeRampStatus = (
  id: string,
  currentPhase: RampProcess["currentPhase"],
  unsignedTxs: UnsignedTx[]
): GetRampStatusResponse => ({
  ...makeRampProcess(id, currentPhase, unsignedTxs),
  anchorFeeFiat: "0",
  anchorFeeUsd: "0",
  feeCurrency: FiatToken.USD,
  networkFeeFiat: "0",
  networkFeeUsd: "0",
  partnerFeeFiat: "0",
  partnerFeeUsd: "0",
  processingFeeFiat: "0",
  processingFeeUsd: "0",
  totalFeeFiat: "0",
  totalFeeUsd: "0",
  vortexFeeFiat: "0",
  vortexFeeUsd: "0"
});

const payloadFor = <T>(calls: Call[], method: string): T => calls.find(call => call.method === method)!.payload as T;

function setup(overrides: { unsignedTxs?: UnsignedTx[]; currentPhase?: RampProcess["currentPhase"] } = {}) {
  const calls: Call[] = [];
  const unsignedTxs = overrides.unsignedTxs ?? [];

  const apiService = new ApiService("http://localhost:3000");
  apiService.getRampStatus = async (id: string) => {
    calls.push({ method: "getRampStatus", payload: id });
    return makeRampStatus(id, overrides.currentPhase ?? "initial", unsignedTxs);
  };
  apiService.registerRamp = async (req: RegisterRampRequest) => {
    calls.push({ method: "registerRamp", payload: req });
    return makeRampProcess("ramp_1", "initial", unsignedTxs);
  };
  apiService.updateRamp = async (req: UpdateRampRequest) => {
    calls.push({ method: "updateRamp", payload: req });
    return makeRampProcess(req.rampId, "initial", unsignedTxs);
  };

  const context: VortexSdkContext = {
    storeEphemerals: async (...args) => {
      calls.push({ method: "storeEphemerals", payload: args });
    }
  };

  const generateEphemerals = async () => ({
    accountMetas: [
      { address: "5SUBSTRATE", type: EphemeralAccountType.Substrate },
      { address: "0xEVM", type: EphemeralAccountType.EVM }
    ],
    ephemerals: {
      EVM: { address: "0xEVM", secret: "s" },
      Substrate: { address: "5SUBSTRATE", secret: "s" }
    }
  });

  const signTransactions = async (txs: UnsignedTx[]): Promise<PresignedTx[]> => {
    calls.push({ method: "signTransactions", payload: txs });
    return txs.map((t, i) => ({ ...t, txData: `presigned_${i}` }));
  };

  const handler = new AlfredpayHandler(apiService, context, generateEphemerals, signTransactions);
  return { calls, handler };
}

describe("isAlfredpayToken routing", () => {
  test("USD/MXN/COP/ARS route to Alfredpay", () => {
    for (const t of [FiatToken.USD, FiatToken.MXN, FiatToken.COP, FiatToken.ARS]) {
      expect(isAlfredpayToken(t)).toBe(true);
    }
  });

  test("BRL/EURC do not route to Alfredpay", () => {
    for (const t of [FiatToken.BRL, FiatToken.EURC]) {
      expect(isAlfredpayToken(t)).toBe(false);
    }
  });
});

describe("AlfredpayHandler onramp", () => {
  test("registers, stores ephemerals, signs, then updates", async () => {
    const { calls, handler } = setup({ unsignedTxs: [makeUnsignedTx("fundEphemeral", "5SUBSTRATE")] });

    const result = await handler.registerAlfredpayOnramp("quote_1", {
      destinationAddress: WALLET,
      fiatAccountId: FIAT_ACCOUNT,
      walletAddress: WALLET
    });

    expect(result.id).toBe("ramp_1");
    expect(calls.map(c => c.method)).toEqual(["registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);

    const reg = payloadFor<RegisterRampRequest>(calls, "registerRamp");
    expect(reg.quoteId).toBe("quote_1");
    expect(reg.additionalData).toMatchObject({ destinationAddress: WALLET, fiatAccountId: FIAT_ACCOUNT });
    expect(reg.signingAccounts).toHaveLength(2);

    const upd = payloadFor<UpdateRampRequest>(calls, "updateRamp");
    expect(upd.presignedTxs).toHaveLength(1);
    expect(upd.additionalData).toEqual({});
  });

  test("throws when destinationAddress missing", async () => {
    const { handler } = setup();
    await expect(handler.registerAlfredpayOnramp("q", { destinationAddress: "", fiatAccountId: FIAT_ACCOUNT })).rejects.toBeInstanceOf(
      MissingAlfredpayOnrampParametersError
    );
  });

  test("registers without fiatAccountId (backend only requires destinationAddress for onramp)", async () => {
    const { calls, handler } = setup();

    const result = await handler.registerAlfredpayOnramp("quote_1", { destinationAddress: WALLET });

    expect(result.id).toBe("ramp_1");
    const reg = payloadFor<RegisterRampRequest>(calls, "registerRamp");
    expect(reg.additionalData).toMatchObject({ destinationAddress: WALLET });
    expect(reg.additionalData?.fiatAccountId).toBeUndefined();
  });
});

describe("AlfredpayHandler offramp", () => {
  test("registers with fiatAccountId + walletAddress (no destinationAddress)", async () => {
    const { calls, handler } = setup({ unsignedTxs: [makeUnsignedTx("squidRouterApprove", WALLET)] });

    const result = await handler.registerAlfredpayOfframp("quote_2", { fiatAccountId: FIAT_ACCOUNT, walletAddress: WALLET });

    expect(result.id).toBe("ramp_1");
    expect(calls.map(c => c.method)).toEqual(["registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);

    const reg = payloadFor<RegisterRampRequest>(calls, "registerRamp");
    expect(reg.additionalData).toMatchObject({ fiatAccountId: FIAT_ACCOUNT, walletAddress: WALLET });
    expect(reg.additionalData?.destinationAddress).toBeUndefined();
  });

  test("throws when fiatAccountId missing", async () => {
    const { handler } = setup();
    await expect(handler.registerAlfredpayOfframp("q", { fiatAccountId: "", walletAddress: WALLET })).rejects.toBeInstanceOf(
      MissingAlfredpayOfframpParametersError
    );
  });

  test("throws when walletAddress missing", async () => {
    const { handler } = setup();
    await expect(handler.registerAlfredpayOfframp("q", { fiatAccountId: FIAT_ACCOUNT, walletAddress: "" })).rejects.toBeInstanceOf(
      MissingAlfredpayOfframpParametersError
    );
  });
});

describe("AlfredpayHandler offramp update", () => {
  test("forwards squidRouter hashes with no presignedTxs after phase check", async () => {
    const { calls, handler } = setup({ currentPhase: "initial" });

    await handler.updateAlfredpayOfframp("ramp_1", { squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" });

    expect(calls.map(c => c.method)).toEqual(["getRampStatus", "updateRamp"]);
    const upd = payloadFor<UpdateRampRequest>(calls, "updateRamp");
    expect(upd.additionalData).toMatchObject({ squidRouterApproveHash: "0xA", squidRouterSwapHash: "0xS" });
    expect(upd.presignedTxs).toHaveLength(0);
  });

  test("throws when ramp is not on the initial phase", async () => {
    const { handler } = setup({ currentPhase: "fundEphemeral" });
    await expect(handler.updateAlfredpayOfframp("ramp_1", {})).rejects.toThrow(/initial phase/);
  });
});
