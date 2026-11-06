import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, evmTokenConfig, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { isAddress } from "viem";
import { type FakeEvm, installFakeEvm } from "../../../../../test-utils/fake-world/fake-evm";
import {
  assertStockPriceWithinGuard,
  assertStockTradable,
  isRobinhoodRoute,
  isStockQuoteUnavailableError,
  isStockSymbol,
  ROBINHOOD_STOCKS,
  ROBINHOOD_USDG_ADDRESS,
  readFreshStockPriceUsd,
  readStockFlags,
  readStockReferencePrice,
  type StockSymbol
} from "./robinhood-stocks";

const LOOKALIKE_USDG = "0x0A3B763d66c0e8c7555c986A3701E1DC1Bf3954F";
const NOW = new Date("2026-11-05T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const priceUnavailable = { isPublic: true, message: QuoteError.StockPriceUnavailable, status: 503 };
const tradingPaused = { isPublic: true, message: QuoteError.StockTradingPaused, status: 503 };

let fakeEvm: FakeEvm;
let restore: () => void;

beforeEach(() => {
  ({ fakeEvm, restore } = installFakeEvm());
});

afterEach(() => {
  restore();
});

function scriptFlags(flags: { paused: unknown; oraclePaused: unknown }) {
  fakeEvm.onReadContract = (network, params) => {
    expect(network).toBe(Networks.Robinhood);
    expect(params.address).toBe(ROBINHOOD_STOCKS.NVDA.address);
    return flags[params.functionName as keyof typeof flags];
  };
}

function scriptFeed(answer: bigint, updatedAt: Date) {
  fakeEvm.onReadContract = (network, params) => {
    expect(network).toBe(Networks.Robinhood);
    expect(params.address).toBe(ROBINHOOD_STOCKS.NVDA.chainlinkFeed);
    expect(params.functionName).toBe("latestRoundData");
    return [1n, answer, 0n, BigInt(Math.floor(updatedAt.getTime() / 1000)), 1n] as const;
  };
}

describe("Robinhood stock allowlist", () => {
  const symbols = Object.keys(ROBINHOOD_STOCKS) as StockSymbol[];

  it("pins the 12 launch stocks to the shared token config", () => {
    expect(symbols).toHaveLength(12);
    for (const symbol of symbols) {
      const details = evmTokenConfig[Networks.Robinhood][symbol];
      expect(details?.erc20AddressSourceChain).toBe(ROBINHOOD_STOCKS[symbol].address);
      expect(details?.decimals).toBe(18);
    }
    expect(evmTokenConfig[Networks.Robinhood][EvmToken.USDG]?.erc20AddressSourceChain).toBe(ROBINHOOD_USDG_ADDRESS);
  });

  it("uses distinct valid contracts and the pool's real fee tier", () => {
    for (const pin of Object.values(ROBINHOOD_STOCKS)) {
      expect(isAddress(pin.address)).toBe(true);
      expect(isAddress(pin.chainlinkFeed)).toBe(true);
      expect(isAddress(pin.uniswapPool)).toBe(true);
      expect([500, 3000]).toContain(pin.uniswapFee);
    }
    for (const field of ["address", "chainlinkFeed", "uniswapPool"] as const) {
      expect(new Set(Object.values(ROBINHOOD_STOCKS).map(pin => pin[field].toLowerCase())).size).toBe(12);
    }
    expect(ROBINHOOD_STOCKS.SGOV.uniswapFee).toBe(500);
  });

  it("recognises only exact allowlisted symbols", () => {
    expect(isStockSymbol("NVDA")).toBe(true);
    for (const symbol of [
      "nvda",
      "USDG",
      "ETH",
      "USDC",
      "NET",
      "AMD",
      "constructor",
      ROBINHOOD_STOCKS.NVDA.address,
      ROBINHOOD_USDG_ADDRESS,
      LOOKALIKE_USDG,
      undefined,
      null,
      42
    ]) {
      expect(isStockSymbol(symbol)).toBe(false);
    }
  });

  it("identifies robinhood routes by the crypto side of the direction", () => {
    expect(isRobinhoodRoute({ from: EPaymentMethod.PIX, rampType: RampDirection.BUY, to: Networks.Robinhood })).toBe(true);
    expect(isRobinhoodRoute({ from: Networks.Robinhood, rampType: RampDirection.SELL, to: EPaymentMethod.PIX })).toBe(true);
    expect(isRobinhoodRoute({ from: EPaymentMethod.PIX, rampType: RampDirection.BUY, to: Networks.Base })).toBe(false);
    expect(isRobinhoodRoute({ from: Networks.Base, rampType: RampDirection.SELL, to: EPaymentMethod.PIX })).toBe(false);
  });
});

describe("readStockFlags", () => {
  it("reports an unpaused token as tradable", async () => {
    scriptFlags({ oraclePaused: false, paused: false });
    expect(await readStockFlags("NVDA" as StockSymbol)).toEqual({ paused: false });
    await expect(assertStockTradable("NVDA" as StockSymbol)).resolves.toBeUndefined();
  });

  it.each([
    [{ oraclePaused: false, paused: true }],
    [{ oraclePaused: true, paused: false }],
    [{ oraclePaused: true, paused: true }],
    [{ oraclePaused: undefined, paused: false }]
  ])("fails closed on %p", async flags => {
    scriptFlags(flags);
    expect(await readStockFlags("NVDA" as StockSymbol)).toEqual({ paused: true });
    await expect(assertStockTradable("NVDA" as StockSymbol)).rejects.toMatchObject(tradingPaused);
  });

  it("fails closed when a read throws", async () => {
    fakeEvm.onReadContract = (_network, params) => {
      if (params.functionName === "oraclePaused") throw new Error("RPC down");
      return false;
    };
    expect(await readStockFlags("NVDA" as StockSymbol)).toEqual({ paused: true });
  });
});

describe("readStockReferencePrice", () => {
  it("scales the 8-decimal answer and returns the feed's timestamp", async () => {
    scriptFeed(18_298_270_000n, NOW);
    const reference = await readStockReferencePrice("NVDA" as StockSymbol);

    expect(reference.priceUsd.toString()).toBe("182.9827");
    expect(reference.updatedAt).toEqual(NOW);
  });

  it.each([0n, -1n])("fails closed on the non-positive answer %p", async answer => {
    scriptFeed(answer, NOW);
    await expect(readStockReferencePrice("NVDA" as StockSymbol)).rejects.toMatchObject(priceUnavailable);
  });

  it("fails closed when the read throws", async () => {
    fakeEvm.onReadContract = () => {
      throw new Error("RPC down");
    };
    await expect(readStockReferencePrice("NVDA" as StockSymbol)).rejects.toMatchObject(priceUnavailable);
  });
});

describe("readFreshStockPriceUsd", () => {
  it("returns the price up to the configured age", async () => {
    scriptFeed(10_000_000_000n, new Date(NOW.getTime() - 72 * HOUR_MS));
    expect((await readFreshStockPriceUsd("NVDA" as StockSymbol, NOW)).toString()).toBe("100");
  });

  it("fails closed beyond the configured age", async () => {
    scriptFeed(10_000_000_000n, new Date(NOW.getTime() - 72 * HOUR_MS - 1000));
    await expect(readFreshStockPriceUsd("NVDA" as StockSymbol, NOW)).rejects.toMatchObject(priceUnavailable);
  });
});

describe("assertStockPriceWithinGuard", () => {
  const reference = { priceUsd: new Big(100), updatedAt: NOW };
  const check = (direction: RampDirection, executionPriceUsd: string) =>
    assertStockPriceWithinGuard({ direction, executionPriceUsd: new Big(executionPriceUsd), now: NOW, reference });

  it.each([
    [RampDirection.BUY, "101", 100],
    [RampDirection.BUY, "102", 200],
    [RampDirection.BUY, "97", -300],
    [RampDirection.SELL, "99", 100],
    [RampDirection.SELL, "98", 200],
    [RampDirection.SELL, "103", -300]
  ])("%s at %s passes with %p bps of adverse deviation", (direction, price, deviationBps) => {
    expect(check(direction, price)).toEqual({ deviationBps });
  });

  it.each([
    [RampDirection.BUY, "102.01"],
    [RampDirection.BUY, "103"],
    [RampDirection.SELL, "97.99"],
    [RampDirection.SELL, "97"]
  ])("%s at %s is rejected as worse for the user than the threshold", (direction, price) => {
    let thrown: unknown;
    try {
      check(direction, price);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject(priceUnavailable);
    expect(isStockQuoteUnavailableError(thrown)).toBe(true);
  });

  it("rejects a stale reference even at the reference price", () => {
    expect(() =>
      assertStockPriceWithinGuard({
        direction: RampDirection.BUY,
        executionPriceUsd: new Big(100),
        now: new Date(NOW.getTime() + 72 * HOUR_MS + 1000),
        reference
      })
    ).toThrow(QuoteError.StockPriceUnavailable);
  });
});
