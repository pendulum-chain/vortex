import { describe, expect, it } from "bun:test";
import type { WalletClient } from "viem";
import { polygonAmoy } from "viem/chains";
import type { UnsignedTx } from "../endpoints/ramp.endpoints";

// Importing ./signUnsigned pulls in the package barrel, which freezes src/constants.ts from
// process.env for the whole test run. Provide the env defaults other test files rely on before
// that happens (same pattern as alfredpayApiService.test.ts), hence the dynamic import.
process.env.ALFREDPAY_API_KEY ||= "test-key";
process.env.ALFREDPAY_API_SECRET ||= "test-secret";

const { Networks } = await import("./networks");
const { createEvmClient, groupUnsignedTxsForSigning } = await import("./signUnsigned");

const EPHEMERAL = {
  address: "0x0000000000000000000000000000000000000000",
  secret: "0x0000000000000000000000000000000000000000000000000000000000000001"
};

function transportUrls(client: WalletClient): (string | undefined)[] {
  const transport = client.transport as unknown as { transports: { value?: { url?: string } }[] };
  return transport.transports.map(t => t.value?.url);
}

function makeTx(network: UnsignedTx["network"], phase: UnsignedTx["phase"]): UnsignedTx {
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

describe("createEvmClient Polygon Amoy transports", () => {
  it("prefers Alchemy for signing and keeps viem's default transport as the fallback", () => {
    const client = createEvmClient(Networks.PolygonAmoy, EPHEMERAL, "test-api-key");

    expect(transportUrls(client)).toEqual([
      "https://polygon-amoy.g.alchemy.com/v2/test-api-key",
      polygonAmoy.rpcUrls.default.http[0]
    ]);
  });

  it("uses only viem's default transport without an Alchemy API key", () => {
    const client = createEvmClient(Networks.PolygonAmoy, EPHEMERAL);

    expect(transportUrls(client)).toEqual([polygonAmoy.rpcUrls.default.http[0]]);
  });
});

describe("groupUnsignedTxsForSigning", () => {
  it("assigns destination-phase transactions on directly signed EVM networks to the EVM group only", () => {
    const tx = makeTx(Networks.Arbitrum, "destinationTransfer");

    const groups = groupUnsignedTxsForSigning([tx]);

    expect(groups.evmTxs).toEqual([tx]);
    expect(groups.destinationNetworkTxs).toEqual([]);
  });

  it("keeps destination-phase transactions on other networks in the destination group", () => {
    const tx = makeTx(Networks.BaseSepolia, "destinationTransfer");

    const groups = groupUnsignedTxsForSigning([tx]);

    expect(groups.destinationNetworkTxs).toEqual([tx]);
    expect(groups.evmTxs).toEqual([]);
  });

  it("never assigns a transaction to both the EVM and destination groups", () => {
    const destinationPhases: UnsignedTx["phase"][] = [
      "destinationTransfer",
      "backupSquidRouterApprove",
      "backupSquidRouterSwap",
      "backupApprove"
    ];
    const txs = Object.values(Networks).flatMap(network => destinationPhases.map(phase => makeTx(network, phase)));

    const groups = groupUnsignedTxsForSigning(txs);

    for (const tx of txs) {
      expect(groups.evmTxs.includes(tx) && groups.destinationNetworkTxs.includes(tx)).toBe(false);
    }
  });
});
