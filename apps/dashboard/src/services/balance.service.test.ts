import { EvmToken, getEvmTokenConfig, Networks } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
});
