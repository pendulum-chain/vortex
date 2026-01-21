import {
  checkEvmBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  getOnChainTokenDetails,
  isEvmToken,
  multiplyByPowerOfTen,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
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

    if (!isEvmToken(quote.outputCurrency)) {
      throw new Error("DestinationTransferHandler: Output currency is not an EVM token");
    }
    const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
    const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails;
    const expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals).toString();
    const destinationNetwork = quote.network as EvmNetworks; // We can assert this type due to checks before
    // TODO: Idempotency check

    // main phase execution loop:
    try {
      await checkEvmBalancePeriodically(
        outTokenDetails.erc20AddressSourceChain,
        state.state.evmEphemeralAddress,
        expectedAmountRaw,
        BALANCE_POLLING_TIME_MS,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        destinationNetwork
      );

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
