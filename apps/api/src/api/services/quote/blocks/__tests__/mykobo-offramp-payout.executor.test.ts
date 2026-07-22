import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { MykoboTransactionStatus, Networks } from "@vortexfi/shared";
import type RampState from "../../../../../models/rampState.model";

const sharedReal = { ...sharedNamespace };
const waitForReceipt = mock(async () => ({ status: "success" }));
const send = mock(async () => "0xnew");
const getTransaction = mock(async () => ({ transaction: { status: MykoboTransactionStatus.COMPLETED } }));
mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({ waitForTransactionReceipt: waitForReceipt }),
      sendRawTransactionWithRetry: send
    })
  },
  MykoboApiService: { getInstance: () => ({ getTransaction }) }
}));
const { MykoboOfframpPayoutExecutor } = await import("../phases/mykobo-offramp-payout/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

describe("Mykobo offramp payout executor recovery", () => {
  it("reuses a confirmed payout hash and resumes provider polling without rebroadcasting", async () => {
    const state = {
        presignedTxs: [{ phase: "mykoboPayoutOnBase", txData: "0xsigned" }],
        state: {
          blockState: {
            mykoboOfframpPayout: {
              mykoboEmail: "verified@example.com",
              mykoboReceivablesAddress: "0x3434343434343434343434343434343434343434",
              mykoboTransactionId: "withdraw-1",
              mykoboTransactionReference: "EUR-WITHDRAW-1"
            }
          },
          mykoboPayoutTxHash: `0x${"1".repeat(64)}`
        }
    } as unknown as RampState;
    const executor = new MykoboOfframpPayoutExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    expect(await executor.executePhase(state)).toBe(state);
    expect(waitForReceipt).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(getTransaction).toHaveBeenCalledWith("withdraw-1");
  });

  it("resumes persisted legacy payout state after the executor migration", async () => {
    const state = {
      presignedTxs: [{ phase: "mykoboPayoutOnBase", txData: "0xsigned" }],
      state: {
        mykoboEmail: "verified@example.com",
        mykoboPayoutTxHash: `0x${"2".repeat(64)}`,
        mykoboReceivablesAddress: "0x3434343434343434343434343434343434343434",
        mykoboTransactionId: "legacy-withdraw",
        mykoboTransactionReference: "EUR-LEGACY-1"
      }
    } as unknown as RampState;
    const executor = new MykoboOfframpPayoutExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    expect(await executor.executePhase(state)).toBe(state);
    expect(getTransaction).toHaveBeenCalledWith("legacy-withdraw");
    expect(send).not.toHaveBeenCalled();
  });
});
