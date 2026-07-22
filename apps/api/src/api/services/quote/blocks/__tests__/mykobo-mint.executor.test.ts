import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import Big from "big.js";
import type RampState from "../../../../../models/rampState.model";
import * as quoteTicketNamespace from "../../../../../models/quoteTicket.model";

const sharedReal = { ...sharedNamespace };
const quoteTicketReal = { ...quoteTicketNamespace };
const waitForBalance = mock(async () => undefined);
const findQuote = mock(async () => ({
  metadata: { blocks: { mykoboMint: { mint: { outputAmountRaw: "100000000" } } } }
}));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalancePeriodically: waitForBalance,
  getEvmTokenBalance: async () => new Big("95000000")
}));
mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuote }
}));

const { MykoboOnrampDepositExecutor } = await import("../phases/mykobo-mint/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
});

describe("MykoboOnrampDepositExecutor recovery", () => {
  it("accepts an already-settled balance at the 95% recovery threshold without starting the live wait", async () => {
    const state = {
      phaseHistory: [{ phase: "mykoboOnrampDeposit", timestamp: new Date() }],
      quoteId: "quote-eur",
      state: { evmEphemeralAddress: "0x1212121212121212121212121212121212121212" }
    } as unknown as RampState;
    const executor = new MykoboOnrampDepositExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    expect(await executor.executePhase(state)).toBe(state);
    expect(waitForBalance).not.toHaveBeenCalled();
  });
});
