import { type EvmNetworks, Networks, TokenType, type EvmTokenDetails } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterRampTokenOptions, getNetworkOptions, type RampTokenOption, sortRampTokenOptions } from "./onramp";

function option(
  label: string,
  networkLabel: string,
  isFromStaticConfig: boolean,
  network: EvmNetworks = Networks.Polygon
): RampTokenOption {
  return {
    currency: label as never,
    label,
    network,
    networkLabel,
    token: {
      assetSymbol: label,
      decimals: 6,
      erc20AddressSourceChain: "0x1111111111111111111111111111111111111111",
      isFromStaticConfig,
      isNative: false,
      network: Networks.Polygon,
      pendulumRepresentative: {} as never,
      type: TokenType.Evm
    } as EvmTokenDetails
  };
}

describe("onramp token options", () => {
  const tokens = [option("WETH", "Polygon", false), option("USDT", "Polygon", true), option("USDC", "Polygon", true)];

  it("orders static tokens before dynamic tokens, then alphabetically", () => {
    assert.deepEqual(
      sortRampTokenOptions(tokens).map(token => token.label),
      ["USDC", "USDT", "WETH"]
    );
  });

  it("searches token symbols, keys, and network names case-insensitively", () => {
    assert.deepEqual(filterRampTokenOptions(tokens, "usd").map(token => token.label), ["USDT", "USDC"]);
    assert.deepEqual(filterRampTokenOptions(tokens, "POLY").map(token => token.label), ["WETH", "USDT", "USDC"]);
  });
});

describe("getNetworkOptions", () => {
  it("collapses tokens to their distinct networks, alphabetical by label", () => {
    const tokens = [
      option("USDC", "Polygon", true),
      option("WETH", "Polygon", false),
      option("USDC", "Arbitrum", true, Networks.Arbitrum),
      option("USDC", "Base", true, Networks.Base)
    ];

    assert.deepEqual(getNetworkOptions(tokens), [
      { id: Networks.Arbitrum, label: "Arbitrum" },
      { id: Networks.Base, label: "Base" },
      { id: Networks.Polygon, label: "Polygon" }
    ]);
  });

  it("returns nothing while the token list is still empty", () => {
    assert.deepEqual(getNetworkOptions([]), []);
  });
});
