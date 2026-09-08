import { describe, expect, it } from "bun:test";
import { EvmNetworks, EvmToken, EvmTokenDetails, evmTokenConfig, Networks, RampDirection, TokenType } from "@vortexfi/shared";
import { APIError } from "../api/errors/api-error";
import { getSupportedCryptocurrencies } from "./cryptocurrencies.config";

const staticUsdc = evmTokenConfig[Networks.Ethereum][EvmToken.USDC] as EvmTokenDetails;
const staticAxlUsdc = evmTokenConfig[Networks.Ethereum][EvmToken.AXLUSDC] as EvmTokenDetails;

const routedPaxg: EvmTokenDetails = {
  assetSymbol: "PAXG",
  decimals: 18,
  erc20AddressSourceChain: "0x45804880de22913dafe09f4980848ece6ecbaf78",
  isNative: false,
  network: Networks.Ethereum,
  pendulumRepresentative: staticUsdc.pendulumRepresentative,
  type: TokenType.Evm
};

// Mirrors the shape produced by mergeWithStaticConfig: static tokens appear under enum key and symbol alias.
const mergedConfig = {
  [Networks.Ethereum]: {
    [EvmToken.AXLUSDC]: { ...staticAxlUsdc, isFromStaticConfig: true },
    [EvmToken.USDC]: { ...staticUsdc, isFromStaticConfig: true },
    PAXG: routedPaxg,
    "USDC.AXL": { ...staticAxlUsdc, isFromStaticConfig: true }
  }
} as unknown as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;

describe("getSupportedCryptocurrencies", () => {
  it("lists routed tokens alongside static ones, both buyable and sellable", () => {
    const result = getSupportedCryptocurrencies(Networks.Ethereum, mergedConfig);
    const bySymbol = Object.fromEntries(result.map(token => [token.assetSymbol, token]));

    expect(bySymbol.PAXG).toEqual({
      assetContractAddress: routedPaxg.erc20AddressSourceChain,
      assetDecimals: 18,
      assetNetwork: Networks.Ethereum,
      assetSymbol: "PAXG",
      rampTypes: [RampDirection.BUY, RampDirection.SELL]
    });
    expect(bySymbol.USDC.rampTypes).toEqual([RampDirection.BUY, RampDirection.SELL]);
  });

  it("dedupes static tokens stored under enum key and symbol alias", () => {
    const result = getSupportedCryptocurrencies(Networks.Ethereum, mergedConfig);
    expect(result.map(token => token.assetSymbol).sort()).toEqual(["PAXG", "USDC", staticAxlUsdc.assetSymbol].sort());
  });

  it("falls back to the static config before the dynamic token list is loaded", () => {
    const result = getSupportedCryptocurrencies(Networks.Ethereum);
    expect(result.map(token => token.assetSymbol).sort()).toEqual(
      Object.values(evmTokenConfig[Networks.Ethereum])
        .map(token => token.assetSymbol)
        .sort()
    );
  });

  it("marks AssetHub USDC as rampable and other AssetHub tokens as not", () => {
    const result = getSupportedCryptocurrencies(Networks.AssetHub);
    const bySymbol = Object.fromEntries(result.map(token => [token.assetSymbol, token.rampTypes]));
    expect(bySymbol.USDC).toEqual([RampDirection.BUY, RampDirection.SELL]);
    expect(bySymbol.DOT).toEqual([]);
  });

  it("rejects a missing or unsupported network", () => {
    expect(() => getSupportedCryptocurrencies(undefined)).toThrow(APIError);
    expect(() => getSupportedCryptocurrencies(Networks.Pendulum)).toThrow(APIError);
  });
});
