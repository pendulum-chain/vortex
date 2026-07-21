import { Networks, TokenType, type EvmTokenDetails } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterOnrampTokenOptions, type OnrampTokenOption, sortOnrampTokenOptions } from "./onramp";

function option(label: string, networkLabel: string, isFromStaticConfig: boolean): OnrampTokenOption {
  return {
    currency: label as never,
    label,
    network: Networks.Polygon,
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
      sortOnrampTokenOptions(tokens).map(token => token.label),
      ["USDC", "USDT", "WETH"]
    );
  });

  it("searches token symbols, keys, and network names case-insensitively", () => {
    assert.deepEqual(filterOnrampTokenOptions(tokens, "usd").map(token => token.label), ["USDT", "USDC"]);
    assert.deepEqual(filterOnrampTokenOptions(tokens, "POLY").map(token => token.label), ["WETH", "USDT", "USDC"]);
  });
});
