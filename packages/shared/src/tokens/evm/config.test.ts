import { describe, expect, test } from "bun:test";
import { VALID_CRYPTO_CURRENCIES } from "../../endpoints";
import { Networks } from "../../helpers";
import { MONERIUM_CHAINS, MONERIUM_TOKEN_CHAINS } from "../../services/monerium";
import { EvmToken, UsdLikeEvmToken } from "../types/evm";
import { isEvmToken } from "../utils/typeGuards";
import { evmTokenConfig } from "./config";

describe("EURe EVM token configuration", () => {
  test("keeps dormant EURe out of the public token registry", () => {
    for (const config of Object.values(evmTokenConfig)) {
      expect(config["EURE" as EvmToken]).toBeUndefined();
    }
  });

  test("distinguishes operational Monerium chains from token-only discovery chains", () => {
    expect(MONERIUM_CHAINS).toEqual([
      "ethereum",
      "gnosis",
      "polygon",
      "arbitrum",
      "linea",
      "base",
      "noble",
      "sepolia",
      "chiado",
      "amoy",
      "arbitrumsepolia",
      "lineasepolia",
      "basesepolia",
      "grand"
    ]);
    expect(MONERIUM_TOKEN_CHAINS).toEqual([...MONERIUM_CHAINS, "scrollsepolia"]);
  });

  test("keeps EURe distinct from public Circle EURC", () => {
    expect(isEvmToken("EURE")).toBe(false);
    expect(VALID_CRYPTO_CURRENCIES).not.toContain("EURE");
    expect(evmTokenConfig[Networks.Base]["EURE" as EvmToken]).toBeUndefined();
    expect(evmTokenConfig[Networks.Base][EvmToken.EURC]).toBeDefined();
  });
});

describe("Robinhood Chain token configuration", () => {
  const tokens = evmTokenConfig[Networks.Robinhood];
  const stocks = [
    EvmToken.SPY,
    EvmToken.TSLA,
    EvmToken.NVDA,
    EvmToken.AMZN,
    EvmToken.AAPL,
    EvmToken.GOOGL,
    EvmToken.MSFT,
    EvmToken.QQQ,
    EvmToken.SPCX,
    EvmToken.META,
    EvmToken.MU,
    EvmToken.SGOV
  ];

  test("pins USDG to the 6-decimal Global Dollar, never the lookalike", () => {
    expect(tokens[EvmToken.USDG]?.erc20AddressSourceChain).toBe("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
    expect(tokens[EvmToken.USDG]?.decimals).toBe(6);
    expect(Object.values(UsdLikeEvmToken)).toContain(UsdLikeEvmToken.USDG);
    for (const token of Object.values(tokens)) {
      expect(token.erc20AddressSourceChain.toLowerCase()).not.toBe("0x0a3b763d66c0e8c7555c986a3701e1dc1bf3954f");
    }
  });

  test("lists ETH as native, 12 stocks with 18 decimals, and nothing else", () => {
    expect(tokens[EvmToken.ETH]?.isNative).toBe(true);
    expect(Object.keys(tokens).sort()).toEqual([EvmToken.ETH, EvmToken.USDG, ...stocks].sort());
    for (const stock of stocks) {
      expect(tokens[stock]).toMatchObject({ assetSymbol: stock, decimals: 18, isNative: false, network: Networks.Robinhood });
    }
    expect(new Set(stocks.map(stock => tokens[stock]?.erc20AddressSourceChain.toLowerCase())).size).toBe(12);
  });
});
