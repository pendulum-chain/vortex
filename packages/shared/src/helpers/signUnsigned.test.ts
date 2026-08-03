import { describe, expect, it } from "bun:test";
import type { UnsignedTx } from "../endpoints/ramp.endpoints";
import type { Networks } from "./networks";

// Importing ./signUnsigned pulls in the package barrel, which freezes src/constants.ts from
// process.env for the whole test run. Provide the env defaults other test files rely on before
// that happens (same pattern as alfredpayApiService.test.ts), hence the dynamic import.
process.env.ALFREDPAY_API_KEY ||= "test-key";
process.env.ALFREDPAY_API_SECRET ||= "test-secret";

const { Networks: NetworksEnum } = await import("./networks");
const { groupUnsignedTxsForSigning } = await import("./signUnsigned");

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

describe("groupUnsignedTxsForSigning", () => {
  it("assigns destination-phase transactions on directly signed EVM networks to the EVM group only", () => {
    const tx = makeTx(NetworksEnum.Arbitrum, "destinationTransfer");

    const groups = groupUnsignedTxsForSigning([tx]);

    expect(groups.evmTxs).toEqual([tx]);
    expect(groups.destinationNetworkTxs).toEqual([]);
  });

  it("keeps destination-phase transactions on other networks in the destination group", () => {
    const tx = makeTx(NetworksEnum.BaseSepolia, "destinationTransfer");

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
    const txs = Object.values(NetworksEnum).flatMap(network => destinationPhases.map(phase => makeTx(network, phase)));

    const groups = groupUnsignedTxsForSigning(txs);

    for (const tx of txs) {
      expect(groups.evmTxs.includes(tx) && groups.destinationNetworkTxs.includes(tx)).toBe(false);
    }
  });
});
