import { EvmToken, getEvmTokenConfig, Networks } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchTokenPortfolio,
  formatTokenBalance,
  getTokenBalance,
  hasSufficientTokenBalance,
  parseTokenPortfolioResponse
} from "./balance.service";

describe("token portfolio balances", () => {
  it("selects the exact configured token address", () => {
    const portfolio = parseTokenPortfolioResponse({
      data: {
        tokens: [
          { tokenAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", tokenBalance: "0x3b9aca00" },
          { tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", tokenBalance: "0x1" }
        ]
      }
    });
    const usdt = getEvmTokenConfig()[Networks.Polygon][EvmToken.USDT];
    assert.ok(usdt);

    const balance = getTokenBalance(portfolio, usdt);
    assert.equal(balance.raw, 1_000_000_000n);
    assert.equal(balance.formatted, "1000.00");
  });

  it("normalizes Alchemy's null address for native POL", () => {
    const portfolio = parseTokenPortfolioResponse({
      data: { tokens: [{ tokenAddress: null, tokenBalance: "0x1bc16d674ec80000" }] }
    });
    const pol = getEvmTokenConfig()[Networks.Polygon][EvmToken.POL];
    assert.ok(pol);

    const balance = getTokenBalance(portfolio, pol);
    assert.equal(balance.raw, 2_000_000_000_000_000_000n);
    assert.equal(balance.formatted, "2.000000");
  });

  it("compares exact raw units using the selected token decimals", () => {
    const balance = { decimals: 18, formatted: "1.000000", raw: 1_000_000_000_000_000_000n };

    assert.equal(hasSufficientTokenBalance(balance, "1"), true);
    assert.equal(hasSufficientTokenBalance(balance, "1.000000000000000001"), false);
  });

  it("formats balances by rounding down like the frontend", () => {
    assert.equal(formatTokenBalance(123_459_999n, 6, 2), "123.45");
    assert.equal(formatTokenBalance(0n, 18, 6), "0.000000");
  });

  // Sandbox offramps run on Amoy. A missing entry throws before the request is made, and the
  // funding gate reads that as "balance unavailable" and blocks registration.
  it("looks balances up on Amoy rather than refusing the network", async () => {
    const originalFetch = globalThis.fetch;
    let requestedNetworks: string[] | undefined;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      requestedNetworks = JSON.parse(init.body).addresses[0].networks;
      return { json: async () => ({ data: { tokens: [] } }), ok: true };
    }) as unknown as typeof fetch;

    try {
      await fetchTokenPortfolio("0x0000000000000000000000000000000000000001", Networks.PolygonAmoy, "test-key");
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(requestedNetworks, ["polygon-amoy"]);
  });
});
