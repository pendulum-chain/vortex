import { describe, expect, test } from "bun:test";
import type { QuoteResponse } from "@vortexfi/shared";
import { GoldUsdcHandler, isGoldUsdcQuote } from "../src/handlers/GoldUsdcHandler.js";
import { VortexSdk } from "../src/VortexSdk.js";

const owner = "0x0000000000000000000000000000000000000001";
const quote = (rampType = "BUY") => ({ rampType, from: "base", to: "base", network: "base", inputCurrency: rampType === "BUY" ? "USDC" : "PAXG", outputCurrency: rampType === "BUY" ? "PAXG" : "USDC" }) as QuoteResponse;

describe("Gold USDC handler", () => {
  test("the public orchestrator routes both Base gold directions and returns only owner requests", async () => {
    const sdk = new VortexSdk({ apiBaseUrl: "https://synthetic.invalid", accessTokenProvider: async () => "synthetic" });
    let calls = 0;
    const userTx = { signer: owner.toUpperCase() };
    (sdk as unknown as { goldUsdcHandler: { register: unknown } }).goldUsdcHandler.register = async () => { calls++; return { id: "gold", unsignedTxs: [userTx, { signer: "0x0000000000000000000000000000000000000002" }] }; };
    for (const direction of ["BUY", "SELL"]) {
      const result = await sdk.registerRamp(quote(direction), { walletAddress: owner, destinationAddress: owner });
      expect(result.unsignedTransactions).toEqual([userTx as never]);
    }
    expect(calls).toBe(2);
  });
  test("selects only native Base USDC and PAXG in either direction", () => {
    expect(isGoldUsdcQuote(quote())).toBe(true);
    expect(isGoldUsdcQuote(quote("SELL"))).toBe(true);
    for (const patch of [{ network: "ethereum" }, { from: "pix" }, { to: "robinhood" }, { inputCurrency: "BRL" }, { outputCurrency: "XAUT" }, { rampType: "OTHER" }]) {
      expect(isGoldUsdcQuote({ ...quote(), ...patch } as QuoteResponse)).toBe(false);
    }
  });
  test("uses the common register, durable-store, presign and update lifecycle without a fiat provider", async () => {
    const order: string[] = [];
    const api = {
      registerRamp: async (data: { additionalData: unknown }) => { order.push("register"); expect(data.additionalData).toEqual({ walletAddress: owner, destinationAddress: owner }); return { id: "gold", unsignedTxs: [] }; },
      updateRamp: async () => { order.push("update"); return { id: "gold" }; }
    };
    const context = { storeEphemerals: async () => { order.push("store"); } };
    const handler = new GoldUsdcHandler(api as never, context as never, async () => ({ ephemerals: {}, accountMetas: [] }), async () => { order.push("presign"); return []; });
    await handler.register("quote", { walletAddress: owner, destinationAddress: owner });
    expect(order).toEqual(["register", "store", "presign", "update"]);
    await expect(handler.register("quote", { walletAddress: "invalid", destinationAddress: owner })).rejects.toThrow("walletAddress");
  });
});
