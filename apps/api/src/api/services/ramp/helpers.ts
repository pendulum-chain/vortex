import { FiatToken, Networks } from "@vortexfi/shared";
import logger from "../../../config/logger";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";

enum TransactionHashKey {
  HydrationToAssethubXcmHash = "hydrationToAssethubXcmHash",
  PendulumToAssethubXcmHash = "pendulumToAssethubXcmHash",
  SquidRouterSwapHash = "squidRouterSwapHash"
}

type ExplorerLinkBuilder = (hash: string, rampState: RampState, quote: QuoteTicket) => string;

// Map chain names from AxelarScan to their respective explorer URLs
const CHAIN_EXPLORERS: Record<string, string> = {
  arbitrum: "https://arbiscan.io/tx",
  avalanche: "https://snowtrace.io/tx",
  base: "https://basescan.org/tx",
  binance: "https://bscscan.com/tx",
  bsc: "https://bscscan.com/tx",
  ethereum: "https://etherscan.io/tx",
  moonbeam: "https://moonscan.io/tx",
  polygon: "https://polygonscan.com/tx"
};

async function getAxelarScanExecutionLink(hash: string): Promise<{ explorerLink: string; executionHash: string }> {
  const url = "https://api.axelarscan.io/gmp/searchGMP";
  const response = await fetch(url, {
    body: JSON.stringify({ txHash: hash }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    logger.error(`Failed to fetch AxelarScan link for hash ${hash}: ${response.statusText}`);
    // Fallback to AxelarScan link
    return {
      executionHash: hash,
      explorerLink: `https://axelarscan.io/gmp/${hash}`
    };
  }

  try {
    const data = await response.json();
    const chain = data[0]?.expressExecuted?.chain || data[0]?.executed?.chain;
    const executionHash = data[0]?.expressExecuted?.transactionHash || data[0]?.executed?.transactionHash;

    if (!executionHash) {
      logger.warn(`No execution hash found in AxelarScan response for ${hash}`);
      return {
        executionHash: hash,
        explorerLink: `https://axelarscan.io/gmp/${hash}`
      };
    }

    // Normalize chain name to lowercase for matching
    const normalizedChain = chain?.toLowerCase();
    const explorerBaseUrl = normalizedChain ? CHAIN_EXPLORERS[normalizedChain] : undefined;

    if (explorerBaseUrl) {
      return {
        executionHash,
        explorerLink: `${explorerBaseUrl}/${executionHash}`
      };
    }

    // Fallback to AxelarScan if chain is not recognized
    logger.warn(`Unknown chain "${chain}" in AxelarScan response for hash ${hash}, using AxelarScan link`);
    return {
      executionHash,
      explorerLink: `https://axelarscan.io/gmp/${executionHash}`
    };
  } catch (error) {
    logger.error(`Failed to parse AxelarScan response for hash ${hash}: ${error}`);
    return {
      executionHash: hash,
      explorerLink: `https://axelarscan.io/gmp/${hash}`
    };
  }
}

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
export async function getFinalTransactionHashForRamp(
  rampState: RampState,
  quote: QuoteTicket
): Promise<{ transactionExplorerLink: string | undefined; transactionHash: string | undefined }> {
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
      // For SquidRouter swaps, query the execution hash from AxelarScan
      if (hashKey === TransactionHashKey.SquidRouterSwapHash) {
        try {
          const isMoneriumPolygonOnramp =
            rampState.from === "sepa" && quote.inputCurrency === FiatToken.EURC && rampState.to === Networks.Polygon;

          if (isMoneriumPolygonOnramp) {
            // For Monerium Polygon onramp, use the hash directly
            return {
              transactionExplorerLink: `https://polygonscan.com/tx/${hash}`,
              transactionHash: hash
            };
          }

          // For other cases, query AxelarScan for the execution hash and chain-specific explorer
          const { explorerLink, executionHash } = await getAxelarScanExecutionLink(hash);

          return {
            transactionExplorerLink: explorerLink,
            transactionHash: executionHash
          };
        } catch (error) {
          logger.error(`Error fetching AxelarScan execution hash for ${hash}: ${error}`);
          // Fallback to original hash if fetching fails
          return {
            transactionExplorerLink: EXPLORER_LINK_BUILDERS[hashKey](hash, rampState, quote),
            transactionHash: hash
          };
        }
      }

      // For other hash types, use them directly
      return {
        transactionExplorerLink: EXPLORER_LINK_BUILDERS[hashKey](hash, rampState, quote),
        transactionHash: hash
      };
    }
  }

  return { transactionExplorerLink: undefined, transactionHash: undefined };
}
