import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import * as blockQuoteNamespace from "../phases/blocks/core/quote";

const blockQuoteReal = { ...blockQuoteNamespace };
let flowRuns = 0;
mock.module("../phases/blocks/core/quote", () => ({
  ...blockQuoteReal,
  runBlockQuoteFlow: async (ctx: Parameters<typeof blockQuoteReal.runBlockQuoteFlow>[0]) => {
    flowRuns++;
    ctx.builtResponse = { id: "quote-1" } as never;
  }
}));

const { QuoteService } = await import(".");

afterAll(() => {
  mock.module("../phases/blocks/core/quote", () => ({ ...blockQuoteReal }));
});

const paxg = "PAXG" as EvmToken;
const buy = {
  from: EPaymentMethod.PIX,
  inputAmount: "50",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  outputCurrency: paxg,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const sell = {
  from: Networks.Base,
  inputAmount: "0.01",
  inputCurrency: paxg,
  network: Networks.Base,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};
const unsupported = { isPublic: true, message: QuoteError.UnsupportedCurrency, status: 400 };

describe("PAXG on Base quote gate", () => {
  const { enabledDirections } = config.gold;
  const service = new QuoteService();

  beforeEach(() => {
    flowRuns = 0;
  });

  afterEach(() => {
    config.gold.enabledDirections = enabledDirections;
  });

  it("rejects both Pix directions while the switch is empty, before any pricing", async () => {
    await expect(service.createQuote(buy)).rejects.toMatchObject(unsupported);
    await expect(service.createQuote(sell)).rejects.toMatchObject(unsupported);
    expect(flowRuns).toBe(0);
  });

  it("switches each direction on its own", async () => {
    config.gold.enabledDirections = [RampDirection.BUY];
    await expect(service.createQuote(buy)).resolves.toMatchObject({ id: "quote-1" });
    await expect(service.createQuote(sell)).rejects.toMatchObject(unsupported);

    config.gold.enabledDirections = [RampDirection.SELL];
    await expect(service.createQuote(buy)).rejects.toMatchObject(unsupported);
    await expect(service.createQuote(sell)).resolves.toMatchObject({ id: "quote-1" });
  });

  it("refuses PAXG on Base against another fiat even with the Pix switch on", async () => {
    config.gold.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    await expect(service.createQuote({ ...buy, from: EPaymentMethod.SPEI, inputCurrency: FiatToken.MXN })).rejects.toMatchObject(
      unsupported
    );
    expect(flowRuns).toBe(0);
  });

  it("never affects other Base tokens or PAXG on another network", async () => {
    await expect(service.createQuote({ ...buy, outputCurrency: EvmToken.USDC })).resolves.toMatchObject({ id: "quote-1" });
    await expect(service.createQuote({ ...sell, from: Networks.Ethereum, network: Networks.Ethereum })).resolves.toMatchObject({
      id: "quote-1"
    });
    expect(flowRuns).toBe(2);
  });
});
