import { FiatToken, Networks } from "@packages/shared";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";

type ExplorerLinkBuilder = (hash: string, rampState: RampState, quote: QuoteTicket) => string;
type TransactionHashKey = "hydrationToAssethubXcmHash" | "pendulumToAssethubXcmHash" | "squidRouterSwapHash";

const TRANSACTION_HASH_PRIORITY: readonly TransactionHashKey[] = [
  "hydrationToAssethubXcmHash",
  "pendulumToAssethubXcmHash",
  "squidRouterSwapHash"
] as const;

const EXPLORER_LINK_BUILDERS: Record<TransactionHashKey, ExplorerLinkBuilder> = {
  hydrationToAssethubXcmHash: hash => `https://hydration.subscan.io/block/${hash}`,
  pendulumToAssethubXcmHash: hash => `https://pendulum.subscan.io/block/${hash}`,
  squidRouterSwapHash: (hash, rampState, quote) => {
    const isMoneriumPolygonOnramp =
      rampState.from === "sepa" && quote.inputCurrency === FiatToken.EURC && rampState.to === Networks.Polygon;

    return isMoneriumPolygonOnramp ? `https://polygonscan.com/tx/${hash}` : `https://axelarscan.io/gmp/${hash}`;
  }
};

/// Finds the transaction hash of the transaction that finalized the ramping process.
/// For now, this will be the hash of the last transaction on the second-last network, ie. the outgoing transfer
/// and not the incoming one.
/// Only works for ramping processes that have reached the "complete" phase.
export function getFinalTransactionHashForRamp(rampState: RampState, quote: QuoteTicket) {
  if (rampState.currentPhase !== "complete") {
    return { transactionExplorerLink: undefined, transactionHash: undefined };
  }

  for (const hashKey of TRANSACTION_HASH_PRIORITY) {
    const hash = rampState.state[hashKey];
    if (hash) {
      return {
        transactionExplorerLink: EXPLORER_LINK_BUILDERS[hashKey](hash, rampState, quote),
        transactionHash: hash
      };
    }
  }

  return { transactionExplorerLink: undefined, transactionHash: undefined };
}
