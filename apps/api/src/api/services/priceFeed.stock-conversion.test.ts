import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EvmToken, FiatToken, Networks, QuoteError, type RampCurrency } from "@vortexfi/shared";
import { type FakeEvm, installFakeEvm } from "../../test-utils/fake-world/fake-evm";
import { ROBINHOOD_STOCKS } from "./phases/blocks/core/robinhood-stocks";
import { PriceFeedService } from "./priceFeed.service";

const NVDA = EvmToken.NVDA as RampCurrency;
const USDC = EvmToken.USDC as RampCurrency;

describe("convertCurrency for allowlisted stocks", () => {
  const service = PriceFeedService.getInstance();
  let fakeEvm: FakeEvm;
  let restore: () => void;
  let feedReads: string[];

  function scriptFeed(answer: bigint, updatedAt = new Date()) {
    fakeEvm.onReadContract = (network, params) => {
      expect(network).toBe(Networks.Robinhood);
      feedReads.push(params.address);
      return [1n, answer, 0n, BigInt(Math.floor(updatedAt.getTime() / 1000)), 1n] as const;
    };
  }

  beforeEach(() => {
    ({ fakeEvm, restore } = installFakeEvm());
    feedReads = [];
  });

  afterEach(() => {
    restore();
    mock.restore();
  });

  it("prices a stock from its Chainlink feed on Robinhood Chain", async () => {
    scriptFeed(18_000_000_000n);

    expect(await service.convertCurrency("2.5", NVDA, USDC, null, Networks.Robinhood)).toBe("450.00000000");
    expect(feedReads).toEqual([ROBINHOOD_STOCKS.NVDA.chainlinkFeed]);
  });

  it("honours explicit decimals", async () => {
    scriptFeed(18_000_000_000n);

    expect(await service.convertCurrency("2.5", NVDA, USDC, 2, Networks.Robinhood)).toBe("450.00");
  });

  it("converts onward to fiat through USD", async () => {
    scriptFeed(18_000_000_000n);
    spyOn(service, "getUsdToFiatExchangeRate").mockResolvedValue(5);

    expect(await service.convertCurrency("2", NVDA, FiatToken.BRL, null, Networks.Robinhood)).toBe("1800.00");
  });

  it("fails closed on a stale reference with the public price error", async () => {
    scriptFeed(18_000_000_000n, new Date(Date.now() - 73 * 60 * 60 * 1000));

    await expect(service.convertCurrency("1", NVDA, USDC, null, Networks.Robinhood)).rejects.toMatchObject({
      message: QuoteError.StockPriceUnavailable,
      status: 503
    });
  });

  it("never treats a same-named token on another network, or an unnamed network, as the stock", async () => {
    scriptFeed(18_000_000_000n);

    for (const network of [undefined, Networks.Ethereum]) {
      await expect(service.convertCurrency("1", NVDA, USDC, null, network)).rejects.toThrow("No CoinGecko token ID mapping for NVDA");
    }
    expect(feedReads).toEqual([]);
  });

  it("leaves non-stock currencies on Robinhood Chain to the normal conversion", async () => {
    expect(await service.convertCurrency("1.5", EvmToken.USDG as RampCurrency, USDC, null, Networks.Robinhood)).toBe("1.5");
    expect(feedReads).toEqual([]);
  });
});
