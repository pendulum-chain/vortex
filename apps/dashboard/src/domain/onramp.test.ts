import { type EvmNetworks, EvmToken, Networks, RampDirection, TokenType, type EvmTokenDetails } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterRampTokenOptions,
  getNetworkOptions,
  getRampTokenOptions,
  type RampTokenOption,
  sortRampTokenOptions
} from "./onramp";
import { eurOnrampBlocker as blocker } from "./onramp";

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

  it("includes native POL for SELL with its exact balance metadata", () => {
    const pol = getRampTokenOptions(RampDirection.SELL).find(
      option => option.network === Networks.Polygon && option.currency === EvmToken.POL
    );

    assert.equal(pol?.token.isNative, true);
    assert.equal(pol?.token.decimals, 18);
    assert.equal(pol?.token.erc20AddressSourceChain, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  });

  it("does not expose native POL for BUY", () => {
    const pol = getRampTokenOptions(RampDirection.BUY).find(
      option => option.network === Networks.Polygon && option.currency === EvmToken.POL
    );

    assert.equal(pol, undefined);
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

describe("eurOnrampBlocker", () => {
  const ready = { chain: "polygon", iban: "provisioned" as const, linkedAddress: "0xAbC0000000000000000000000000000000000001", source: "oauth" as const };

  it("requires a provisioned IBAN on a linked wallet first", () => {
    assert.equal(blocker(null, ready.linkedAddress), "link_wallet");
    assert.equal(blocker({ ...ready, iban: "missing" }, ready.linkedAddress), "link_wallet");
    assert.equal(blocker({ ...ready, iban: "elsewhere" }, ready.linkedAddress), "link_wallet");
  });

  it("then requires the linked wallet to be the connected one", () => {
    assert.equal(blocker(ready, undefined), "connect_wallet");
    assert.equal(blocker(ready, "0x0000000000000000000000000000000000000002"), "wrong_wallet");
    assert.equal(blocker(ready, ready.linkedAddress.toLowerCase()), null);
  });
});
