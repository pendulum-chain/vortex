import {
  checkEvmBalancePeriodically,
  checkEvmNativeBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/**
 * Handler for transferring funds to the destination address on EVM networks (onramp only)
 */
export class DestinationTransferHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "destinationTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const evmClientManager = EvmClientManager.getInstance();
    // Only handle onramp operations
    if (state.type !== RampDirection.BUY) {
      throw new Error("DestinationTransferHandler: Only supports onramp operations");
    }

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

    const isNativeToken =
      outTokenDetails.isNative || outTokenDetails.erc20AddressSourceChain.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

    const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
    const expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals).toString();
    const destinationNetwork = quote.network as EvmNetworks; // We can assert this type due to checks before
    const { destinationTransferTxHash } = state.state;
    if (destinationTransferTxHash) {
      try {
        const client = evmClientManager.getClient(destinationNetwork);
        const receipt = await client.getTransactionReceipt({ hash: destinationTransferTxHash as `0x${string}` });

        if (receipt.status === "success") {
          return this.transitionToNextPhase(state, "complete");
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

    // main phase execution loop:
    try {
      if (isNativeToken) {
        await checkEvmNativeBalancePeriodically(
          state.state.evmEphemeralAddress,
          expectedAmountRaw,
          BALANCE_POLLING_TIME_MS,
          EVM_BALANCE_CHECK_TIMEOUT_MS,
          destinationNetwork
        );
      } else {
        await checkEvmBalancePeriodically(
          outTokenDetails.erc20AddressSourceChain,
          state.state.evmEphemeralAddress,
          expectedAmountRaw,
          BALANCE_POLLING_TIME_MS,
          EVM_BALANCE_CHECK_TIMEOUT_MS,
          destinationNetwork
        );
      }

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

      return this.transitionToNextPhase(state, "complete");
    } catch (error) {
      throw this.createRecoverableError(
        `DestinationTransferHandler: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}

export default new DestinationTransferHandler();
