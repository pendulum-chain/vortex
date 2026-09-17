import { describe, expect, it } from "bun:test";
import {
  EPaymentMethod,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  TokenType
} from "@vortexfi/shared";
import { APIError } from "../api/errors/api-error";
import { isRetiredAssetHubCorridor, validateChainSupport } from "../api/services/phases/blocks/core/helpers";
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

const BOTH = [RampDirection.BUY, RampDirection.SELL];

describe("getSupportedCryptocurrencies", () => {
  it("lists routed tokens alongside static ones, both buyable and sellable", () => {
    const result = getSupportedCryptocurrencies(Networks.Ethereum, mergedConfig);
    const bySymbol = Object.fromEntries(result.map(token => [token.assetSymbol, token]));

    expect(bySymbol.PAXG).toEqual({
      assetContractAddress: routedPaxg.erc20AddressSourceChain,
      assetDecimals: 18,
      assetNetwork: Networks.Ethereum,
      assetSymbol: "PAXG",
      rampTypes: BOTH
    });
    expect(bySymbol.USDC.rampTypes).toEqual(BOTH);
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

  it("advertises no directions on EVM networks the quote service rejects", () => {
    for (const network of [Networks.Moonbeam, Networks.BaseSepolia, Networks.PolygonAmoy]) {
      // The runtime guard behind the metadata: quote creation rejects both directions.
      expect(() => validateChainSupport(RampDirection.BUY, EPaymentMethod.PIX, network)).toThrow(APIError);
      expect(() => validateChainSupport(RampDirection.SELL, network, EPaymentMethod.PIX)).toThrow(APIError);

      const result = getSupportedCryptocurrencies(network);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(token => token.rampTypes.length === 0)).toBe(true);
    }
  });

  it("advertises no directions for AssetHub, whose only corridors are retired", () => {
    // Chain support alone would allow AssetHub; the retirement guard is what closes it.
    expect(() => validateChainSupport(RampDirection.BUY, EPaymentMethod.PIX, Networks.AssetHub)).not.toThrow();
    expect(
      isRetiredAssetHubCorridor({
        from: EPaymentMethod.PIX,
        inputCurrency: FiatToken.BRL,
        outputCurrency: "USDC" as EvmToken,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      })
    ).toBe(true);
    expect(
      isRetiredAssetHubCorridor({
        from: Networks.AssetHub,
        inputCurrency: "USDC" as EvmToken,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.PIX
      })
    ).toBe(true);

    const result = getSupportedCryptocurrencies(Networks.AssetHub);
    expect(result.map(token => token.assetSymbol).sort()).toEqual(["DOT", "USDC", "USDT"]);
    expect(result.every(token => token.rampTypes.length === 0)).toBe(true);
  });

  it("explains how to pass the required network query parameter", () => {
    expect(() => getSupportedCryptocurrencies(undefined)).toThrow(
      "Missing required query parameter 'network'. Example: /v1/supported-cryptocurrencies?network=ethereum"
    );
  });

  it("lists supported networks when an invalid network is supplied", () => {
    expect(() => getSupportedCryptocurrencies(Networks.Pendulum)).toThrow(APIError);
    expect(() => getSupportedCryptocurrencies(Networks.Pendulum)).toThrow(
      "Invalid network: 'pendulum'. Supported networks are:"
    );
  });

  it("does not expose dormant EURe deployments", () => {
    for (const network of [Networks.Base, Networks.Polygon]) {
      expect(getSupportedCryptocurrencies(network).some(token => token.assetSymbol === "EURe")).toBe(false);
    }
  });
});
