import { describe, expect, it, mock } from "bun:test";
import { EphemeralAccountType, EvmClientManager, EvmToken, Networks } from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi } from "viem";
import type { PrepareCtx } from "../core/types";
import type { MykoboOfframpPayoutRegistrationFacts } from "../phases/mykobo-offramp-payout/registration";
import type { MykoboOfframpPayoutMetadata } from "../phases/mykobo-offramp-payout/simulation";
import { prepareMykoboOfframpPayoutTxs } from "../phases/mykobo-offramp-payout/transactions";

const EPHEMERAL = "0x1212121212121212121212121212121212121212";
const RECEIVABLES = "0x3434343434343434343434343434343434343434";

describe("EUR offramp payout transaction preparation", () => {
  it("binds the signed payout to provider facts and appends all Base cleanup approvals", async () => {
    const manager = EvmClientManager.getInstance() as unknown as { getClient: (...args: unknown[]) => unknown };
    const originalGetClient = manager.getClient;
    manager.getClient = mock(() => ({ estimateFeesPerGas: async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }) }));
    try {
      const context: PrepareCtx<MykoboOfframpPayoutMetadata, MykoboOfframpPayoutRegistrationFacts> = {
        accounts: { [EphemeralAccountType.EVM]: { address: EPHEMERAL, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: {
          payoutAmountDecimal: "98.63",
          payoutAmountRaw: "9863",
          transferAmountDecimal: "98.98",
          transferAmountRaw: "98980000"
        },
        ownRegistrationFacts: {
          mykoboEmail: "verified@example.com",
          mykoboReceivablesAddress: RECEIVABLES,
          mykoboTransactionId: "withdraw-1",
          mykoboTransactionReference: "EUR-WITHDRAW-1"
        },
        quote: {} as never
      };
      const prepared = await prepareMykoboOfframpPayoutTxs(context);
      expect(prepared.intents.map(intent => intent.phase)).toEqual([
        "mykoboPayoutOnBase",
        "baseCleanupUsdc",
        "baseCleanupEurc",
        "baseCleanupAxlUsdc"
      ]);
      expect(prepared.intents.map(intent => intent.lane)).toEqual(["main", "cleanup", "cleanup", "cleanup"]);
      expect(prepared.intents.every(intent => intent.network === Networks.Base && intent.signer === EPHEMERAL)).toBe(true);
      expect(prepared.state).toEqual(context.ownRegistrationFacts);

      const payout = prepared.intents[0].txData as { data: `0x${string}`; to: string };
      const decoded = decodeFunctionData({ abi: erc20Abi, data: payout.data });
      expect(decoded.functionName).toBe("transfer");
      expect(decoded.args).toEqual([RECEIVABLES, 98_980_000n]);
      expect(payout.to.toLowerCase()).not.toBe(RECEIVABLES.toLowerCase());
    } finally {
      manager.getClient = originalGetClient;
    }
  });
});
