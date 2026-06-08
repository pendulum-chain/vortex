import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  RampPhase
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { UnrecoverablePhaseError } from "../../../errors/phase-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function validateDestinationTransferRecipient(rawTx: `0x${string}`, expectedDestination: string): void {
  const decoded = parseTransaction(rawTx);

  if (!decoded.to) {
    throw new Error("DestinationTransferHandler: Presigned transaction has no 'to' address");
  }

  const isNativeTransfer = !decoded.data || decoded.data === "0x";

  if (isNativeTransfer) {
    if (decoded.to.toLowerCase() !== expectedDestination.toLowerCase()) {
      throw new Error(
        "DestinationTransferHandler: Native transfer recipient mismatch. " +
          `Expected ${expectedDestination}, got ${decoded.to}`
      );
    }
    return;
  }

  // ERC-20 transfer: `to` is the token contract, recipient is in calldata
  if (!decoded.data) {
    throw new Error("DestinationTransferHandler: ERC-20 transfer missing calldata");
  }
  const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: decoded.data });
  if (functionName !== "transfer") {
    throw new Error(`DestinationTransferHandler: Expected ERC-20 'transfer' call, got '${functionName}'`);
  }

  const [recipient] = args as [string, bigint];
  if (recipient.toLowerCase() !== expectedDestination.toLowerCase()) {
    throw new Error(
      "DestinationTransferHandler: ERC-20 transfer recipient mismatch. " + `Expected ${expectedDestination}, got ${recipient}`
    );
  }
}

/**
 * Handler for transferring funds to the destination address on EVM networks (onramp only)
 */
export class DestinationTransferHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "destinationTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const evmClientManager = EvmClientManager.getInstance();

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails;
    if (!outTokenDetails) {
      throw new Error(
        `DestinationTransferHandler: Unsupported output token ${quote.outputCurrency} for network ${quote.network}`
      );
    }

    const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
    const expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals).toString();
    const destinationNetwork = quote.network as EvmNetworks; // We can assert this type due to checks before
    const { destinationTransferTxHash, destinationAddress } = state.state as StateMetadata;

    if (destinationAddress) {
      validateDestinationTransferRecipient(destinationTransfer as `0x${string}`, destinationAddress);
    } else {
      logger.warn("DestinationTransferHandler: No destinationAddress in state metadata, skipping recipient validation");
    }
    if (destinationTransferTxHash) {
      try {
        const client = evmClientManager.getClient(destinationNetwork);
        const receipt = await client.getTransactionReceipt({ hash: destinationTransferTxHash as `0x${string}` });

        if (receipt.status === "success") {
          return state;
        } else {
          throw new Error(`Transaction ${destinationTransferTxHash} failed on chain.`);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "TransactionReceiptNotFoundError") {
          throw error;
        }
        // If receipt not found, proceed to normal flow
      }
    }

    // Nonce-gap guard: a presigned nonce ahead of the live ephemeral nonce can never be mined and would
    // silently retry until the processor gives up, stranding user funds. Raise it for manual review.
    // Reading the live nonce is best-effort: an RPC failure must not block the happy path.
    if (!destinationTransferTxHash && state.state.evmEphemeralAddress) {
      try {
        const presignedNonce = parseTransaction(destinationTransfer as `0x${string}`).nonce;
        if (presignedNonce !== undefined) {
          try {
            const liveNonce = await evmClientManager.getClient(destinationNetwork).getTransactionCount({
              address: state.state.evmEphemeralAddress as `0x${string}`,
              blockTag: "pending"
            });
            if (presignedNonce > liveNonce) {
              throw this.createUnrecoverableError(
                `DestinationTransferHandler: presigned nonce ${presignedNonce} is ahead of the ephemeral live nonce ${liveNonce}. ` +
                  "The transfer can never broadcast (nonce gap); manual review required."
              );
            }
          } catch (error) {
            if (error instanceof UnrecoverablePhaseError) {
              throw error;
            }
            logger.warn(
              `DestinationTransferHandler: could not verify ephemeral nonce before broadcast - ${(error as Error).message}`
            );
          }
        }
      } catch (error) {
        if (error instanceof UnrecoverablePhaseError) {
          throw error;
        }
        logger.warn(
          `DestinationTransferHandler: could not parse presigned destination transfer for nonce check - ${(error as Error).message}`
        );
      }
    }

    // main phase execution loop:
    try {
      await checkEvmBalanceForToken({
        amountDesiredRaw: expectedAmountRaw,
        chain: destinationNetwork,
        intervalMs: BALANCE_POLLING_TIME_MS,
        ownerAddress: state.state.evmEphemeralAddress,
        timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
        tokenDetails: outTokenDetails
      });

      // send the transaction, log hash in the state for recovery.
      const txHash = await evmClientManager.sendRawTransactionWithRetry(
        quote.network as EvmNetworks,
        destinationTransfer as `0x${string}`
      );
      // store in state
      await state.update({
        state: {
          ...state.state,
          destinationTransferTxHash: txHash
        }
      });
      // (optional) wait for balance to be updated on user - destination

      return state;
    } catch (error) {
      throw this.createRecoverableError(
        `DestinationTransferHandler: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}

export default new DestinationTransferHandler();
