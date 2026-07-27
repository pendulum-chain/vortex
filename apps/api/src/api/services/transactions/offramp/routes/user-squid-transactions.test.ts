import { Networks } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUserSquidTransactions } from "./user-squid-transactions";

const txData = { data: "0x", gas: "1", to: "0x1111111111111111111111111111111111111111", value: "0" } as const;

describe("buildUserSquidTransactions", () => {
  it("builds approve then swap for ERC-20 input", () => {
    const transactions = buildUserSquidTransactions({
      approveData: txData,
      approvePhase: "squidRouterNoPermitApprove",
      isNative: false,
      network: Networks.Polygon,
      signer: "0x2222222222222222222222222222222222222222",
      swapData: txData,
      swapPhase: "squidRouterNoPermitSwap"
    });

    assert.deepEqual(
      transactions.map(transaction => [transaction.phase, transaction.nonce]),
      [
        ["squidRouterNoPermitApprove", 0],
        ["squidRouterNoPermitSwap", 1]
      ]
    );
  });

  it("builds only nonce-zero swap for native input", () => {
    const transactions = buildUserSquidTransactions({
      approveData: txData,
      approvePhase: "squidRouterNoPermitApprove",
      isNative: true,
      network: Networks.Polygon,
      signer: "0x2222222222222222222222222222222222222222",
      swapData: { ...txData, value: "1000000000000000000" },
      swapPhase: "squidRouterNoPermitSwap"
    });

    assert.deepEqual(transactions.map(transaction => [transaction.phase, transaction.nonce]), [
      ["squidRouterNoPermitSwap", 0]
    ]);
    assert.equal((transactions[0]?.txData as { value: string }).value, "1000000000000000000");
  });
});
