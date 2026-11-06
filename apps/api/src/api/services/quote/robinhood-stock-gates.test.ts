import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import { config } from "../../../config/vars";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
import { type FakeEvm, installFakeEvm } from "../../../test-utils/fake-world/fake-evm";
import { APIError } from "../../errors/api-error";
import * as blockQuoteNamespace from "../phases/blocks/core/quote";

const blockQuoteReal = { ...blockQuoteNamespace };
let runFlow = blockQuoteReal.runBlockQuoteFlow;
mock.module("../phases/blocks/core/quote", () => ({
  ...blockQuoteReal,
  runBlockQuoteFlow: (ctx: Parameters<typeof runFlow>[0]) => runFlow(ctx)
}));

const { QuoteService } = await import(".");

afterAll(() => {
  mock.module("../phases/blocks/core/quote", () => ({ ...blockQuoteReal }));
});

const buy = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Robinhood,
  outputCurrency: EvmToken.NVDA,
  rampType: RampDirection.BUY,
  to: Networks.Robinhood
};

const sell = {
  from: Networks.Robinhood,
  inputAmount: "1",
  inputCurrency: EvmToken.NVDA,
  network: Networks.Robinhood,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};

const invalidNetwork = { isPublic: true, message: "Invalid network: robinhood", status: 400 };
const notAvailable = { isPublic: true, message: QuoteError.StockTokenNotAvailable, status: 400 };
const tradingPaused = { isPublic: true, message: QuoteError.StockTradingPaused, status: 503 };

describe("Robinhood Chain quote gates", () => {
  const enabledDirections = config.stocks.enabledDirections;
  const service = new QuoteService();
  let fakeEvm: FakeEvm;
  let restore: () => void;
  let flowRuns: number;

  let readCount: number;
  const flagsRead = () => readCount > 0;

  const partnerFindOne = Partner.findOne;
  const configFindOne = PartnerPricingConfig.findOne;

  beforeEach(() => {
    // The gates run before pricing, which only needs to find the stocks partner here.
    Partner.findOne = mock(async () => ({ id: "stocks-id", name: "vortex-stocks" })) as unknown as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async () => ({
      markupType: "none",
      vortexFeeType: "relative"
    })) as unknown as typeof PartnerPricingConfig.findOne;
    ({ fakeEvm, restore } = installFakeEvm());
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    readCount = 0;
    flowRuns = 0;
    fakeEvm.onReadContract = () => {
      readCount++;
      return false;
    };
    runFlow = async ctx => {
      flowRuns++;
      ctx.builtResponse = { id: "quote-1" } as never;
    };
  });

  afterEach(() => {
    Partner.findOne = partnerFindOne;
    PartnerPricingConfig.findOne = configFindOne;
    restore();
    config.stocks.enabledDirections = enabledDirections;
    runFlow = blockQuoteReal.runBlockQuoteFlow;
  });

  it("reaches the flow for an allowlisted, unpaused stock in both directions", async () => {
    await expect(service.createQuote(buy)).resolves.toMatchObject({ id: "quote-1" });
    await expect(service.createQuote(sell)).resolves.toMatchObject({ id: "quote-1" });
    expect(flowRuns).toBe(2);
  });

  describe("direction switch", () => {
    it("rejects both directions when the corridor is off, before reading the chain", async () => {
      config.stocks.enabledDirections = [];
      await expect(service.createQuote(buy)).rejects.toMatchObject(invalidNetwork);
      await expect(service.createQuote(sell)).rejects.toMatchObject(invalidNetwork);
      expect(flagsRead()).toBe(false);
      expect(flowRuns).toBe(0);
    });

    it("switches each direction on its own", async () => {
      config.stocks.enabledDirections = [RampDirection.BUY];
      await expect(service.createQuote(buy)).resolves.toBeDefined();
      await expect(service.createQuote(sell)).rejects.toMatchObject(invalidNetwork);

      config.stocks.enabledDirections = [RampDirection.SELL];
      await expect(service.createQuote(buy)).rejects.toMatchObject(invalidNetwork);
      await expect(service.createQuote(sell)).resolves.toBeDefined();
    });

    it("comes before the allowlist", async () => {
      config.stocks.enabledDirections = [];
      await expect(service.createQuote({ ...buy, outputCurrency: EvmToken.USDG })).rejects.toMatchObject(invalidNetwork);
    });

    it("never affects other networks", async () => {
      config.stocks.enabledDirections = [];
      await expect(service.createQuote({ ...buy, network: Networks.Base, outputCurrency: EvmToken.USDC, to: Networks.Base })).resolves.toBeDefined();
      expect(flagsRead()).toBe(false);
    });
  });

  describe("corridor", () => {
    beforeEach(() => {
      runFlow = blockQuoteReal.runBlockQuoteFlow;
    });

    it.each([
      [{ ...buy, from: EPaymentMethod.SPEI, inputCurrency: FiatToken.MXN }],
      [{ ...buy, from: EPaymentMethod.ACH, inputCurrency: FiatToken.USD }],
      [{ ...buy, from: EPaymentMethod.SPEI }],
      [{ ...sell, outputCurrency: FiatToken.MXN, to: EPaymentMethod.SPEI }],
      [{ ...sell, outputCurrency: FiatToken.BRL, to: EPaymentMethod.SPEI }]
    ])("leaves anything but BRL via Pix to the catalog's own rejection: %p", async request => {
      await expect(service.createQuote(request)).rejects.toMatchObject({
        message: expect.stringContaining("No block flow mapped"),
        status: httpStatus.BAD_REQUEST
      });
      expect(flagsRead()).toBe(false);
    });
  });

  it("answers a EUR pay-in with the public unsupported-network error", async () => {
    await expect(service.createQuote({ ...buy, from: EPaymentMethod.SEPA, inputCurrency: FiatToken.EURC })).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.EurOnrampNetworkUnsupported,
      status: 400
    });
    expect(flowRuns).toBe(0);
  });

  describe("allowlist", () => {
    it.each([
      [EvmToken.USDG],
      [EvmToken.ETH],
      [EvmToken.USDC],
      ["nvda"],
      ["AMD"],
      ["0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"],
      ["0x0A3B763d66c0e8c7555c986A3701E1DC1Bf3954F"]
    ])("rejects %s in both directions without reading the chain", async token => {
      await expect(service.createQuote({ ...buy, outputCurrency: token as EvmToken })).rejects.toMatchObject(notAvailable);
      await expect(service.createQuote({ ...sell, inputCurrency: token as EvmToken })).rejects.toMatchObject(notAvailable);
      expect(flagsRead()).toBe(false);
      expect(flowRuns).toBe(0);
    });
  });

  describe("issuer pause", () => {
    it.each(["paused", "oraclePaused"])("rejects when %s is set", async flag => {
      fakeEvm.onReadContract = (_network, params) => params.functionName === flag;
      await expect(service.createQuote(buy)).rejects.toMatchObject(tradingPaused);
      await expect(service.createQuote(sell)).rejects.toMatchObject(tradingPaused);
      expect(flowRuns).toBe(0);
    });

    it("fails closed when the flags cannot be read", async () => {
      fakeEvm.onReadContract = () => {
        throw new Error("RPC down");
      };
      await expect(service.createQuote(buy)).rejects.toMatchObject(tradingPaused);
      expect(flowRuns).toBe(0);
    });
  });

  describe("errors raised inside the flow", () => {
    it.each([QuoteError.StockTradingPaused, QuoteError.StockPriceUnavailable])("keeps the public 503 %s", async message => {
      runFlow = async () => {
        throw new APIError({ isPublic: true, message, status: httpStatus.SERVICE_UNAVAILABLE });
      };
      await expect(service.createQuote(buy)).rejects.toMatchObject({ isPublic: true, message, status: 503 });
    });

    it("still masks everything else, including a 503 with another message", async () => {
      for (const error of [new Error("boom"), new APIError({ message: "provider down", status: httpStatus.SERVICE_UNAVAILABLE })]) {
        runFlow = async () => {
          throw error;
        };
        await expect(service.createQuote(buy)).rejects.toMatchObject({ message: QuoteError.FailedToCalculateQuote, status: 500 });
      }
    });
  });

  describe("best quote", () => {
    const eligible = (rampType: RampDirection, from?: EPaymentMethod, to?: EPaymentMethod): Networks[] =>
      (service as unknown as { getEligibleNetworks(...args: unknown[]): Networks[] }).getEligibleNetworks(rampType, from, to);

    it("never considers Robinhood Chain in either direction", () => {
      for (const networks of [eligible(RampDirection.BUY, EPaymentMethod.PIX), eligible(RampDirection.SELL, undefined, EPaymentMethod.PIX)]) {
        expect(networks).toContain(Networks.Base);
        expect(networks).not.toContain(Networks.Robinhood);
      }
    });

    it("has nothing to offer a client that whitelists only Robinhood Chain", async () => {
      const { network: _network, to: _to, ...best } = buy;
      await expect(service.createBestQuote({ ...best, networks: [Networks.Robinhood] })).rejects.toMatchObject({
        message: expect.stringContaining("No eligible networks found"),
        status: httpStatus.BAD_REQUEST
      });
      expect(flowRuns).toBe(0);
    });
  });
});
