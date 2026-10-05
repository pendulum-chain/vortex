import { afterEach, describe, expect, it, mock, setSystemTime, spyOn } from "bun:test";
import { classifyReferenceVenue, fetchCoinbaseProductStatus, fetchCoinbaseReference, isWithinReferenceBand } from "./reference-rate";

// The partner reference is the Coinbase EURC-USDC bid/ask midpoint (adr-0005 P12,
// amendment 2026-09-18): spot, no averaging, with a spread guard for thin books.

function serve(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  mock.restore();
  setSystemTime();
});

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

describe("fetchCoinbaseReference", () => {
  it("reads the EURC-USDC ticker midpoint at the oracle's decimals as the reference", async () => {
    setSystemTime(new Date(1_800_000_000_000));
    const fetchSpy = serve({ ask: "1.1475", bid: "1.1471", price: "1.1472", volume: "12.5" });
    expect(await fetchCoinbaseReference(8)).toEqual({
      price: "1.1473",
      rateRaw: 114_730_000n,
      source: "coinbase-exchange:EURC-USDC:mid",
      time: new Date(1_800_000_000_000)
    });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.exchange.coinbase.com/products/EURC-USDC/ticker");
  });

  it("floors the midpoint to the unit", async () => {
    serve({ ask: "1.00000002", bid: "1.00000001" });
    expect((await fetchCoinbaseReference(8)).rateRaw).toBe(100_000_001n);
  });

  it("defers on a book wider than 50 bps", async () => {
    serve({ ask: "1.1530", bid: "1.1470" });
    await expect(fetchCoinbaseReference(8)).rejects.toThrow("Coinbase EURC-USDC spread of 52 bps exceeds 50 bps");
  });

  it("defers on an inverted or empty book", async () => {
    serve({ ask: "1.1470", bid: "1.1475" });
    await expect(fetchCoinbaseReference(8)).rejects.toThrow(
      "Coinbase top of book is inverted or empty (bid 1.1475, ask 1.1470)"
    );
    mock.restore();
    serve({ ask: "1.0", bid: "0" });
    await expect(fetchCoinbaseReference(8)).rejects.toThrow("Coinbase top of book is inverted or empty (bid 0, ask 1.0)");
  });

  it("defers on a bad status or anything but two positive decimals", async () => {
    serve(null, 503);
    await expect(fetchCoinbaseReference(8)).rejects.toThrow("Coinbase ticker responded 503");
    for (const body of [{ price: "1.1472" }, { ask: "1.1475" }, { ask: "abc", bid: "1.1471" }, { ask: 1.1475, bid: 1.1471 }, null]) {
      mock.restore();
      serve(body);
      await expect(fetchCoinbaseReference(8)).rejects.toThrow("Coinbase ticker response is malformed");
    }
  });
});

describe("reference venue status", () => {
  it("accepts only an online product with trading enabled", () => {
    expect(classifyReferenceVenue({ status: "online", tradingDisabled: false })).toBeNull();
    expect(classifyReferenceVenue({ status: "delisted", tradingDisabled: true })).toContain("is delisted");
    expect(classifyReferenceVenue({ status: "online", tradingDisabled: true })).toContain("trading disabled");
  });

  it("reads the product status from Coinbase and rejects malformed answers", async () => {
    const fetchSpy = serve({ id: "EURC-USDC", status: "online", trading_disabled: false });
    expect(await fetchCoinbaseProductStatus()).toEqual({ status: "online", tradingDisabled: false });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.exchange.coinbase.com/products/EURC-USDC");
    mock.restore();
    serve({ status: "online" });
    await expect(fetchCoinbaseProductStatus()).rejects.toThrow("Coinbase product response is malformed");
    mock.restore();
    serve(null, 503);
    await expect(fetchCoinbaseProductStatus()).rejects.toThrow("Coinbase product responded 503");
  });
});
