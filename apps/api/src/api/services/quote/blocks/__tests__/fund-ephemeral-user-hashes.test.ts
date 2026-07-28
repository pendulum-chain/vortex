import { afterAll, describe, expect, it, mock } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";
import * as userTxVerifier from "../../../phases/helpers/user-tx-verifier";

const verifyUserSubmittedTxByHash = mock(async () => undefined);
mock.module("../../../phases/helpers/user-tx-verifier", () => ({
  ...userTxVerifier,
  verifyUserSubmittedTxByHash
}));

const { FundEphemeralExecutor } = await import("../phases/fund-ephemeral/execution");

afterAll(() => {
  mock.module("../../../phases/helpers/user-tx-verifier", () => ({ ...userTxVerifier }));
});

function makeQuote() {
  return {
    metadata: {
      blocks: {
        evmOfframpSource: {
          fromNetwork: Networks.Arbitrum,
          fromToken: EvmToken.USDC,
          inputAmountRaw: "1000000",
          toNetwork: Networks.Base,
          toToken: EvmToken.USDC
        }
      },
      globals: {
        fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
        partner: null,
        request: {}
      }
    },
    outputCurrency: FiatToken.BRL
  } as unknown as QuoteTicket;
}

function makeState(signer: string, stateOverrides: Record<string, unknown> = {}) {
  return {
    from: Networks.Arbitrum,
    state: {
      evmEphemeralAddress: "0x00000000000000000000000000000000000000ee",
      squidRouterSwapHash: "0xswap",
      ...stateOverrides
    },
    type: RampDirection.SELL,
    unsignedTxs: [
      { phase: "squidRouterApprove", signer },
      { phase: "squidRouterSwap", signer }
    ]
  } as unknown as RampState;
}

describe("FundEphemeralExecutor user hash verification", () => {
  it("allows an omitted approval hash but still verifies the user swap", async () => {
    verifyUserSubmittedTxByHash.mockClear();
    const handler = Object.create(FundEphemeralExecutor.prototype) as any;
    const state = makeState("0x00000000000000000000000000000000000000aa");

    await handler.verifyUserSubmittedSourceTransactions(state, makeQuote());

    expect(verifyUserSubmittedTxByHash).toHaveBeenCalledTimes(1);
    expect(verifyUserSubmittedTxByHash).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "0xswap", presignedPhase: "squidRouterSwap" })
    );
  });

  it("does not treat ephemeral-owned Squid transactions as user submissions", async () => {
    verifyUserSubmittedTxByHash.mockClear();
    const handler = Object.create(FundEphemeralExecutor.prototype) as any;
    const state = makeState("0x00000000000000000000000000000000000000ee");

    await handler.verifyUserSubmittedSourceTransactions(state, makeQuote());

    expect(verifyUserSubmittedTxByHash).not.toHaveBeenCalled();
  });
});
