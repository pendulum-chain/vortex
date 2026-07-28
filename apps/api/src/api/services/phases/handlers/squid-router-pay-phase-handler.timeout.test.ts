import { describe, expect, it } from "bun:test";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { RecoverablePhaseError } from "../../../errors/phase-error";
import { SquidRouterPayPhaseHandler } from "./squid-router-pay-phase-handler";

type BridgeStatusChecker = {
  checkBridgeStatus(state: RampState, swapHash: string, quote: QuoteTicket, timeoutMs?: number): Promise<void>;
};

describe("SquidRouterPayPhaseHandler bridge polling timeout", () => {
  it("rejects with a recoverable error when its deadline expires", async () => {
    const handler = Object.create(SquidRouterPayPhaseHandler.prototype) as BridgeStatusChecker;
    const state = { state: {} } as RampState;
    const quote = {} as QuoteTicket;

    const result = handler.checkBridgeStatus(state, "0xswap", quote, 0);

    await expect(result).rejects.toBeInstanceOf(RecoverablePhaseError);
    await expect(result).rejects.toThrow("Bridge status check timed out after 0ms");
  });
});
