import { afterAll, describe, expect, it, mock } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";
import * as userTxVerifier from "../../../phases/helpers/user-tx-verifier";
import { privateKeyToAccount } from "viem/accounts";

// Snapshot before mocking: mock.module mutates the imported namespace in place, so
// spreading `userTxVerifier` at restore time would copy the stub back.
const userTxVerifierReal = { ...userTxVerifier };

const verifyUserSubmittedTxByHash = mock(async () => undefined);
mock.module("../../../phases/helpers/user-tx-verifier", () => ({
  ...userTxVerifier,
  verifyUserSubmittedTxByHash
}));
const { FundEphemeralExecutor } = await import("../phases/fund-ephemeral/execution");

afterAll(() => {
  mock.module("../../../phases/helpers/user-tx-verifier", () => userTxVerifierReal);
});

function makeQuote(outputCurrency: FiatToken = FiatToken.BRL) {
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
    outputCurrency
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

  it("verifies Mykobo EUR SELL source transactions", async () => {
    verifyUserSubmittedTxByHash.mockClear();
    const handler = Object.create(FundEphemeralExecutor.prototype) as any;

    await handler.verifyUserSubmittedSourceTransactions(
      makeState("0x00000000000000000000000000000000000000aa"),
      makeQuote(FiatToken.EURC)
    );

    expect(verifyUserSubmittedTxByHash).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "0xswap", presignedPhase: "squidRouterSwap" })
    );
  });

  it("preserves AlfredPay and AssetHub exclusions", async () => {
    verifyUserSubmittedTxByHash.mockClear();
    const handler = Object.create(FundEphemeralExecutor.prototype) as any;
    const alfredpayState = makeState("0x00000000000000000000000000000000000000aa");
    const assethubState = makeState("0x00000000000000000000000000000000000000aa");
    assethubState.from = Networks.AssetHub;

    await handler.verifyUserSubmittedSourceTransactions(alfredpayState, makeQuote(FiatToken.MXN));
    await handler.verifyUserSubmittedSourceTransactions(assethubState, makeQuote());

    expect(verifyUserSubmittedTxByHash).not.toHaveBeenCalled();
  });
});

describe("FundEphemeralExecutor destination gas funding", () => {
  it("uses the signed payout liability for non-Ethereum EVM destinations", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const rawTx = await account.signTransaction({
      chainId: 137,
      gas: 100_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
      to: "0x0000000000000000000000000000000000000001",
      type: "eip1559",
      value: 0n
    });
    const handler = Object.create(FundEphemeralExecutor.prototype) as any;
    handler.getPresignedTransaction = () => ({ network: Networks.Polygon, txData: rawTx });

    expect(handler.getDestinationEvmFundingRequirementRaw({} as RampState, Networks.Polygon)).toBe(
      3_000_000_000_000_000n
    );
  });
});
