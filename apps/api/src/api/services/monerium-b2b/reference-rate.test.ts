import { describe, expect, it } from "bun:test";
import {
  Candle,
  COINBASE_EURC_CANDLES_URL,
  COINBASE_REFERENCE_SOURCE,
  computeWindowVwap,
  fetchCoinbaseReference,
  isWithinReferenceBand,
  parseCandles,
  REFERENCE_FALLBACK_WINDOW_SECONDS,
  REFERENCE_WINDOW_SECONDS,
  selectReferenceWindow
} from "./reference-rate";

const END = 1_800_000_000; // window end, a minute boundary
const DECIMALS = 8;

/** A flat candle: low = high = close, so its typical price is `price`. */
function candle(bucketStart: number, price: number, volume: number): Candle {
  return [bucketStart, price, price, price, price, volume];
}

describe("computeWindowVwap", () => {
  it("weights each candle's typical price by its volume", () => {
    const candles = [candle(END - 60, 1.14, 10), candle(END - 120, 1.16, 30)];
    // (1.14 x 10 + 1.16 x 30) / 40 = 1.155
    expect(computeWindowVwap(candles, END, REFERENCE_WINDOW_SECONDS, DECIMALS)).toBe(115_500_000n);
  });

  it("uses (low + high + close) / 3 as the candle price", () => {
    const skewed: Candle = [END - 60, 1.14, 1.15, 1.2, 1.145, 5];
    expect(computeWindowVwap([skewed], END, REFERENCE_WINDOW_SECONDS, DECIMALS)).toBe(114_500_000n);
  });

  it("ignores candles outside the window and returns null without volume", () => {
    const candles = [candle(END - 360, 2.0, 100), candle(END, 3.0, 100), candle(END - 60, 1.14, 0)];
    expect(computeWindowVwap(candles, END, REFERENCE_WINDOW_SECONDS, DECIMALS)).toBeNull();
    expect(computeWindowVwap(candles, END, 3_600, DECIMALS)).toBe(200_000_000n);
  });

  it("rejects negative or non-finite candle values", () => {
    expect(() => computeWindowVwap([candle(END - 60, -1, 1)], END, 300, DECIMALS)).toThrow();
    expect(() => computeWindowVwap([candle(END - 60, Number.NaN, 1)], END, 300, DECIMALS)).toThrow();
  });
});

describe("selectReferenceWindow", () => {
  it("prefers the five-minute window and widens to an hour only when it has no volume", () => {
    const busy = [candle(END - 60, 1.14, 10), candle(END - 1_800, 1.5, 100)];
    expect(selectReferenceWindow(busy, END, DECIMALS)).toEqual({
      rateRaw: 114_000_000n,
      windowSeconds: REFERENCE_WINDOW_SECONDS
    });

    const quiet = [candle(END - 60, 1.14, 0), candle(END - 1_800, 1.5, 100)];
    expect(selectReferenceWindow(quiet, END, DECIMALS)).toEqual({
      rateRaw: 150_000_000n,
      windowSeconds: REFERENCE_FALLBACK_WINDOW_SECONDS
    });

    expect(selectReferenceWindow([candle(END - 60, 1.14, 0)], END, DECIMALS)).toBeNull();
  });
});

describe("parseCandles", () => {
  it("accepts Coinbase's array-of-arrays shape and rejects anything else", () => {
    expect(parseCandles([[END, 1, 2, 1.5, 1.8, 3]])).toEqual([[END, 1, 2, 1.5, 1.8, 3]]);
    expect(() => parseCandles({ candles: [] })).toThrow("not an array");
    expect(() => parseCandles([[END, 1, 2]])).toThrow("malformed");
    expect(() => parseCandles([[END, "1", 2, 1.5, 1.8, 3]])).toThrow("malformed");
  });
});

describe("isWithinReferenceBand", () => {
  const oracle = 114_000_000n; // 1.14 at 8 decimals

  it("accepts references inside the band, inclusive of its edges", () => {
    expect(isWithinReferenceBand(oracle, oracle, 100)).toBe(true);
    expect(isWithinReferenceBand((oracle * 10_100n) / 10_000n, oracle, 100)).toBe(true);
    expect(isWithinReferenceBand((oracle * 9_900n) / 10_000n, oracle, 100)).toBe(true);
  });

  it("rejects references outside the band and a zero reference", () => {
    expect(isWithinReferenceBand((oracle * 10_101n) / 10_000n, oracle, 100)).toBe(false);
    expect(isWithinReferenceBand((oracle * 9_899n) / 10_000n, oracle, 100)).toBe(false);
    expect(isWithinReferenceBand(0n, oracle, 100)).toBe(false);
  });
});

describe("fetchCoinbaseReference", () => {
  const nowMs = (END - 30) * 1000; // half a minute into the bucket that ends at END

  function fakeFetch(status: number, body: unknown) {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return { json: async () => body, ok: status >= 200 && status < 300, status };
    };
    return { calls, fetchImpl };
  }

  it("requests an hour of one-minute candles and returns the five-minute VWAP with its window", async () => {
    const { calls, fetchImpl } = fakeFetch(200, [candle(END - 60, 1.1432, 10), candle(END - 120, 1.1432, 10)]);
    const quote = await fetchCoinbaseReference(DECIMALS, fetchImpl, nowMs);
    expect(calls).toHaveLength(1);
    expect(calls[0].startsWith(`${COINBASE_EURC_CANDLES_URL}?granularity=60&start=`)).toBe(true);
    expect(calls[0]).toContain(`start=${new Date((END - REFERENCE_FALLBACK_WINDOW_SECONDS) * 1000).toISOString()}`);
    expect(calls[0]).toContain(`end=${new Date(nowMs).toISOString()}`);
    expect(quote).toEqual({
      price: "1.1432",
      rateRaw: 114_320_000n,
      source: COINBASE_REFERENCE_SOURCE,
      time: new Date(nowMs),
      windowSeconds: REFERENCE_WINDOW_SECONDS
    });
  });

  it("fails on a non-2xx response, a malformed body, or an hour without volume", async () => {
    await expect(fetchCoinbaseReference(DECIMALS, fakeFetch(503, []).fetchImpl, nowMs)).rejects.toThrow("503");
    await expect(fetchCoinbaseReference(DECIMALS, fakeFetch(200, { price: "1.14" }).fetchImpl, nowMs)).rejects.toThrow(
      "not an array"
    );
    await expect(
      fetchCoinbaseReference(DECIMALS, fakeFetch(200, [candle(END - 60, 1.14, 0)]).fetchImpl, nowMs)
    ).rejects.toThrow("no EURC-USD volume");
  });
});
