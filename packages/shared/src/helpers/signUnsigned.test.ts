import {describe, expect, it} from "bun:test";
import {Networks, UnsignedTx} from "../index";
import {getEvmSigningRpcUrls, isDestinationNetworkSigningTx, isDirectEvmSigningTx} from "./signUnsigned";

function makeTx(network: Networks, phase: UnsignedTx["phase"]): UnsignedTx {
  return {
    meta: {},
    network,
    nonce: 0,
    phase,
    signer: "0x0000000000000000000000000000000000000000",
    txData: {
      data: "0x",
      gas: "21000",
      maxFeePerGas: "1",
      maxPriorityFeePerGas: "1",
      to: "0x0000000000000000000000000000000000000000",
      value: "0"
    }
  };
}

describe("getEvmSigningRpcUrls", () => {
  it("uses Alchemy first and viem's default transport as the Polygon Amoy signing fallback", () => {
    expect(getEvmSigningRpcUrls(Networks.PolygonAmoy, "test-api-key")).toEqual([
      "https://polygon-amoy.g.alchemy.com/v2/test-api-key",
      ""
    ]);
  });

  it("uses only viem's default Polygon Amoy signing transport without an Alchemy API key", () => {
    expect(getEvmSigningRpcUrls(Networks.PolygonAmoy)).toEqual([""]);
  });
});

describe("EVM signing transaction grouping", () => {
  it("keeps destination-phase EVM transactions out of the destination signing group", () => {
    const destinationTx = makeTx(Networks.Arbitrum, "destinationTransfer");

    expect(isDestinationNetworkSigningTx(destinationTx)).toBe(false);
    expect(isDirectEvmSigningTx(destinationTx)).toBe(true);
  });

  it("keeps Polygon Amoy destination phases in the direct EVM signing group", () => {
    const polygonAmoyTx = makeTx(Networks.PolygonAmoy, "destinationTransfer");

    expect(isDestinationNetworkSigningTx(polygonAmoyTx)).toBe(false);
    expect(isDirectEvmSigningTx(polygonAmoyTx)).toBe(true);
  });
});
