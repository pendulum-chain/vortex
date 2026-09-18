import { describe, expect, it } from "bun:test";
import {
  classifyReferenceVenue,
  computeMid,
  fetchCoinbaseProductStatus,
  fetchCoinbaseReference,
  isWithinReferenceBand,
  parseTicker,
  spreadBps
} from "./reference-rate";

// The partner reference is the Coinbase EURC-USDC bid/ask midpoint (adr-0005 P12,
// amendment 2026-09-18): spot, no averaging, with a spread guard for thin books.

describe("isWithinReferenceBand", () => {
  it("mirrors the contract's symmetric band around Chainlink", () => {
    const oracle = 114_000_000n;
    expect(isWithinReferenceBand(oracle, oracle, 100)).toBe(true);
    expect(isWithinReferenceBand((oracle * 10_100n) / 10_000n, oracle, 100)).toBe(true);
    expect(isWithinReferenceBand((oracle * 9_900n) / 10_000n, oracle, 100)).toBe(true);
    expect(isWithinReferenceBand((oracle * 10_101n) / 10_000n, oracle, 100)).toBe(false);
    expect(isWithinReferenceBand((oracle * 9_899n) / 10_000n, oracle, 100)).toBe(false);
  });
});

describe("top of book", () => {
  it("parses a ticker and rejects anything that is not two positive decimals", () => {
    expect(parseTicker({ ask: "1.1475", bid: "1.1471", price: "1.1472", volume: "12.5" })).toEqual({ ask: "1.1475", bid: "1.1471" });
    expect(() => parseTicker({ ask: "1.1475" })).toThrow("malformed");
    expect(() => parseTicker({ ask: "abc", bid: "1.1471" })).toThrow("malformed");
    expect(() => parseTicker(null)).toThrow("malformed");
  });

  it("computes the midpoint at the oracle's decimals and the spread in bps", () => {
    expect(computeMid({ ask: "1.1475", bid: "1.1471" }, 8)).toBe(114_730_000n);
    expect(spreadBps({ ask: "1.1475", bid: "1.1471" }, 8)).toBe(3);
    expect(spreadBps({ ask: "1.1530", bid: "1.1470" }, 8)).toBe(52);
    expect(() => spreadBps({ ask: "1.1470", bid: "1.1475" }, 8)).toThrow("inverted");
    expect(() => spreadBps({ ask: "1.0", bid: "0" }, 8)).toThrow("inverted or empty");
  });
});

describe("fetchCoinbaseReference", () => {
  const ok = (body: unknown) => async () => ({ json: async () => body, ok: true, status: 200 });

  it("reads the ticker midpoint as the reference", async () => {
    const quote = await fetchCoinbaseReference(8, ok({ ask: "1.1475", bid: "1.1471" }), 1_800_000_000_000);
    expect(quote).toEqual({
      price: "1.1473",
      rateRaw: 114_730_000n,
      source: "coinbase-exchange:EURC-USDC:mid",
      time: new Date(1_800_000_000_000)
    });
  });

  it("defers on a thin book, an inverted book, a bad status or a malformed body", async () => {
    await expect(fetchCoinbaseReference(8, ok({ ask: "1.1530", bid: "1.1470" }))).rejects.toThrow("spread of 52 bps exceeds 50 bps");
    await expect(fetchCoinbaseReference(8, ok({ ask: "1.1470", bid: "1.1475" }))).rejects.toThrow("inverted");
    await expect(fetchCoinbaseReference(8, async () => ({ json: async () => null, ok: false, status: 503 }))).rejects.toThrow("503");
    await expect(fetchCoinbaseReference(8, ok({ price: "1.1472" }))).rejects.toThrow("malformed");
  });

  it("requests the EURC-USDC ticker", async () => {
    let requested = "";
    await fetchCoinbaseReference(8, async url => {
      requested = url;
      return { json: async () => ({ ask: "1.1475", bid: "1.1471" }), ok: true, status: 200 };
    });
    expect(requested).toBe("https://api.exchange.coinbase.com/products/EURC-USDC/ticker");
  });
});

describe("reference venue status", () => {
  it("accepts only an online product with trading enabled", () => {
    expect(classifyReferenceVenue({ status: "online", tradingDisabled: false })).toBeNull();
    expect(classifyReferenceVenue({ status: "delisted", tradingDisabled: true })).toContain("is delisted");
    expect(classifyReferenceVenue({ status: "online", tradingDisabled: true })).toContain("trading disabled");
  });

  it("reads the product status from Coinbase and rejects malformed answers", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe("https://api.exchange.coinbase.com/products/EURC-USDC");
      return { json: async () => ({ id: "EURC-USDC", status: "online", trading_disabled: false }), ok: true, status: 200 };
    };
    expect(await fetchCoinbaseProductStatus(fetchImpl)).toEqual({ status: "online", tradingDisabled: false });
    await expect(
      fetchCoinbaseProductStatus(async () => ({ json: async () => ({ status: "online" }), ok: true, status: 200 }))
    ).rejects.toThrow("malformed");
    await expect(fetchCoinbaseProductStatus(async () => ({ json: async () => null, ok: false, status: 503 }))).rejects.toThrow(
      "503"
    );
  });
});
