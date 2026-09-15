import { describe, expect, it } from "bun:test";
import {
  COINBASE_EURC_TICKER_URL,
  COINBASE_REFERENCE_SOURCE,
  fetchCoinbaseReference,
  isWithinReferenceBand,
  toReferenceRateRaw
} from "./reference-rate";

describe("toReferenceRateRaw", () => {
  it("scales a decimal price to the oracle's decimals", () => {
    expect(toReferenceRateRaw("1.14", 8)).toBe(114_000_000n);
    expect(toReferenceRateRaw("1", 8)).toBe(100_000_000n);
    expect(toReferenceRateRaw("0.98765432", 8)).toBe(98_765_432n);
  });

  it("rejects malformed or non-positive prices", () => {
    for (const bad of ["", "abc", "-1.1", "1e5", "0", "0.0"]) {
      expect(() => toReferenceRateRaw(bad, 8)).toThrow();
    }
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
  function fakeFetch(status: number, body: unknown) {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return { json: async () => body, ok: status >= 200 && status < 300, status };
    };
    return { calls, fetchImpl };
  }

  it("parses the ticker into a scaled, timestamped, attributable quote", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { price: "1.1432", time: "2026-09-15T10:00:00.123456Z", trade_id: 4711 });
    const quote = await fetchCoinbaseReference(8, fetchImpl);
    expect(calls).toEqual([COINBASE_EURC_TICKER_URL]);
    expect(quote).toMatchObject({
      price: "1.1432",
      rateRaw: 114_320_000n,
      source: COINBASE_REFERENCE_SOURCE,
      tradeId: "4711"
    });
    expect(quote.time.toISOString()).toBe("2026-09-15T10:00:00.123Z");
  });

  it("fails on a non-2xx response or a body without a usable price", async () => {
    await expect(fetchCoinbaseReference(8, fakeFetch(503, {}).fetchImpl)).rejects.toThrow("503");
    await expect(fetchCoinbaseReference(8, fakeFetch(200, { price: 1.14 }).fetchImpl)).rejects.toThrow("no price");
    await expect(fetchCoinbaseReference(8, fakeFetch(200, { price: "0" }).fetchImpl)).rejects.toThrow("positive");
    await expect(fetchCoinbaseReference(8, fakeFetch(200, { price: "1.14", time: "soon" }).fetchImpl)).rejects.toThrow(
      "timestamp"
    );
  });
});
