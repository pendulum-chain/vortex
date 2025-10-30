import { FiatToken, Networks } from "@packages/shared";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";

enum TransactionHashKey {
  HydrationToAssethubXcmHash = "hydrationToAssethubXcmHash",
  PendulumToAssethubXcmHash = "pendulumToAssethubXcmHash",
  SquidRouterSwapHash = "squidRouterSwapHash"
}

type ExplorerLinkBuilder = (hash: string, rampState: RampState, quote: QuoteTicket) => string;

const EXPLORER_LINK_BUILDERS: Record<TransactionHashKey, ExplorerLinkBuilder> = {
  [TransactionHashKey.HydrationToAssethubXcmHash]: hash => `https://hydration.subscan.io/block/${hash}`,

  [TransactionHashKey.PendulumToAssethubXcmHash]: hash => `https://pendulum.subscan.io/block/${hash}`,

  [TransactionHashKey.SquidRouterSwapHash]: (hash, rampState, quote) => {
    const isMoneriumPolygonOnramp =
      rampState.from === "sepa" && quote.inputCurrency === FiatToken.EURC && rampState.to === Networks.Polygon;

    return isMoneriumPolygonOnramp ? `https://polygonscan.com/tx/${hash}` : `https://axelarscan.io/gmp/${hash}`;
  }
};

const TRANSACTION_HASH_PRIORITY: readonly TransactionHashKey[] = [
  TransactionHashKey.HydrationToAssethubXcmHash,
  TransactionHashKey.PendulumToAssethubXcmHash,
  TransactionHashKey.SquidRouterSwapHash
] as const;

/// Generate a sandbox transaction hash for testing purposes. It's derived from the id of the ramp state to ensure uniqueness.
/// The form is 0x + first 64 hex characters of the UUID (without dashes) + padded with zeros to reach 64 characters.
function deriveSandboxTransactionHash(rampState: RampState): string {
  const base = rampState.id.replace(/-/g, "").slice(0, 64);
  return "0x" + base.padEnd(64, "0");
}

/// Finds the transaction hash of the transaction that finalized the ramping process.
/// For now, this will be the hash of the last transaction on the second-last network, ie. the outgoing transfer
/// and not the incoming one.
/// Only works for ramping processes that have reached the "complete" phase.
export function getFinalTransactionHashForRamp(rampState: RampState, quote: QuoteTicket) {
  if (rampState.currentPhase !== "complete") {
    return { transactionExplorerLink: undefined, transactionHash: undefined };
  }

  if (SANDBOX_ENABLED) {
    const sandboxHash = deriveSandboxTransactionHash(rampState);
    return {
      transactionExplorerLink: `https://sandbox-explorer.example.com/tx/${sandboxHash}`,
      transactionHash: sandboxHash
    };
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
