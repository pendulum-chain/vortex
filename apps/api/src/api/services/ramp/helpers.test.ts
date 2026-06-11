import {describe, expect, it} from "bun:test";
import {Networks, RampDirection} from "@vortexfi/shared";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import {getFinalTransactionHashForRampV2} from "./helpers";

type RampStateTestOverrides = {
  currentPhase?: string;
  id?: string;
  state?: Record<string, string | undefined>;
  type?: RampDirection;
};

function createRampState(overrides: RampStateTestOverrides): RampState {
  return {
    currentPhase: "complete",
    id: "12345678-1234-1234-1234-123456789abc",
    state: {},
    type: RampDirection.BUY,
    ...overrides
  } as unknown as RampState;
}

function createQuote(network: Networks): QuoteTicket {
  return { network } as unknown as QuoteTicket;
}

describe("getFinalTransactionHashForRampV2", () => {
  it("prefers destinationTransfer over the legacy squid router hash for EVM onramps", () => {
    const result = getFinalTransactionHashForRampV2(
      createRampState({
        state: {
          destinationTransferTxHash: "0xdestination",
          squidRouterSwapHash: "0xsquid"
        }
      }),
      createQuote(Networks.Base)
    );

    expect(result).toEqual({
      transactionExplorerLink: "https://basescan.org/tx/0xdestination",
      transactionHash: "0xdestination"
    });
  });

  it("uses the AssetHub XCM hash for AssetHub onramps", () => {
    const result = getFinalTransactionHashForRampV2(
      createRampState({
        state: {
          destinationTransferTxHash: "0xdestination",
          pendulumToAssethubXcmHash: "0xassethub"
        }
      }),
      createQuote(Networks.AssetHub)
    );

    expect(result).toEqual({
      transactionExplorerLink: "https://pendulum.subscan.io/block/0xassethub",
      transactionHash: "0xassethub"
    });
  });

  it("uses the corridor terminal transfer hash for offramps", () => {
    const result = getFinalTransactionHashForRampV2(
      createRampState({
        state: {
          brlaPayoutTxHash: "0xbrla"
        },
        type: RampDirection.SELL
      }),
      createQuote(Networks.Base)
    );

    expect(result).toEqual({
      transactionExplorerLink: "https://basescan.org/tx/0xbrla",
      transactionHash: "0xbrla"
    });
  });
});
