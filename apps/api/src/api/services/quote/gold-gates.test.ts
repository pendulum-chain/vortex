import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
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
const usdcBuy = {
  from: Networks.Base,
  inputAmount: "25",
  inputCurrency: EvmToken.USDC,
  network: Networks.Base,
  outputCurrency: paxg,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const usdcSell = {
  from: Networks.Base,
  inputAmount: "0.01",
  inputCurrency: paxg,
  network: Networks.Base,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.SELL,
  to: Networks.Base
};
const unsupported = { isPublic: true, message: QuoteError.UnsupportedCurrency, status: 400 };

describe("PAXG on Base quote gate", () => {
  const { enabledDirections, usdcEnabledDirections } = config.gold;
  const service = new QuoteService();

  const partnerFindOne = Partner.findOne;
  const configFindOne = PartnerPricingConfig.findOne;

  beforeEach(() => {
    flowRuns = 0;
    // The gate runs before pricing, which only needs to find the Gold USDC pricing partner here.
    Partner.findOne = mock(async () => ({ id: "gold-id", name: "vortex-gold" })) as unknown as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async () => ({
      markupType: "none",
      vortexFeeType: "relative"
    })) as unknown as typeof PartnerPricingConfig.findOne;
  });

  afterEach(() => {
    Partner.findOne = partnerFindOne;
    PartnerPricingConfig.findOne = configFindOne;
    config.gold.enabledDirections = enabledDirections;
    config.gold.usdcEnabledDirections = usdcEnabledDirections;
  });

  it("switches the USDC rail on its own, whatever the Pix switch says", async () => {
    config.gold.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    await expect(service.createQuote(usdcBuy)).rejects.toMatchObject(unsupported);
    await expect(service.createQuote(usdcSell)).rejects.toMatchObject(unsupported);

    config.gold.enabledDirections = [];
    config.gold.usdcEnabledDirections = [RampDirection.SELL];
    await expect(service.createQuote(usdcBuy)).rejects.toMatchObject(unsupported);
    await expect(service.createQuote(usdcSell)).resolves.toMatchObject({ id: "quote-1" });
    await expect(service.createQuote(sell)).rejects.toMatchObject(unsupported);
  });

  it.each(["9.999999", "1000000.000001", "10.0000001"])("refuses a USDC buy of %s before any pricing", async inputAmount => {
    config.gold.usdcEnabledDirections = [RampDirection.BUY];
    await expect(service.createQuote({ ...usdcBuy, inputAmount })).rejects.toMatchObject({
      isPublic: true,
      message: "USDC amount must be between 10 and 1000000 with at most 6 decimals",
      status: 400
    });
    expect(flowRuns).toBe(0);
  });

  it("refuses a sale finer than one wei of PAXG on either rail", async () => {
    config.gold.enabledDirections = [RampDirection.SELL];
    config.gold.usdcEnabledDirections = [RampDirection.SELL];
    for (const request of [sell, usdcSell]) {
      await expect(service.createQuote({ ...request, inputAmount: "0.0100000000000000001" })).rejects.toMatchObject({
        isPublic: true,
        message: "The amount has more than 18 decimal places.",
        status: 400
      });
      await expect(service.createQuote({ ...request, inputAmount: "0.010000000000000001" })).resolves.toBeDefined();
    }
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
