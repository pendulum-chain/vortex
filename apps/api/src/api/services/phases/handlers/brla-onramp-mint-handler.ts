import {
  AveniaPaymentMethod,
  BalanceCheckError,
  BalanceCheckErrorType,
  BlockchainSendMethod,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import TaxId from "../../../../models/taxId.model";
import { APIError } from "../../../errors/api-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// The rationale for these difference is that it allows for a finer check over the payment timeout in
// case of service restart. A smaller timeout for the balance check loop allows to get out to the outer
// process loop and check for the operation timestamp.
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Phase description: wait for the tokens to arrive at the Moonbeam ephemeral address.
// If the timeout is reached, we assume the user has NOT made the payment and we cancel the ramp.
export class BrlaOnrampMintHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("BrlaOnrampMintHandler: State metadata corrupted. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.aveniaMint) {
      throw new Error("Missing 'aveniaMint' in quote metadata");
    }

    if (!quote.metadata.aveniaTransfer) {
      throw new Error("Missing 'aveniaTransfer' in quote metadata");
    }

    const taxIdRecord = await TaxId.findByPk(state.state.taxId);
    if (!taxIdRecord) {
      throw new APIError({
        message: "Subaccount not found",
        status: httpStatus.BAD_REQUEST
      });
    }

    const brlaApiService = BrlaApiService.getInstance();
    // Check internal balance of Avenia subaccount
    const { balances } = await brlaApiService.getAccountBalance(state.state.taxId);

    try {
      await waitUntilTrueWithTimeout(
        async () => {
          if (!quote.metadata.aveniaMint) {
            return false;
          }

          return balances.BRLA.toFixed(6) >= quote.metadata.aveniaMint.outputAmountDecimal.toFixed(6, 0);
        },
        5000,
        PAYMENT_TIMEOUT_MS
      );
    } catch (error) {
      const isCheckTimeout = error instanceof Error && error.message.includes("Timeout");
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(
            `BrlaOnrampMintHandler: phase timeout reached waiting for Avenia balance with error: ${error}`
          )
        : new Error(`Error checking Avenia balance: ${error}`);
    }

    // Transfer the funds from the subaccount to the ephemeral address
    const aveniaQuote = await brlaApiService.createPayInQuote({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputAmount: quote.metadata.aveniaMint.outputAmountDecimal.toFixed(6, 0),
      inputCurrency: BrlaCurrency.BRLA,
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
      outputThirdParty: false,
      subAccountId: taxIdRecord.subAccountId
    });

    logger.info("BrlaOnrampMintHandler: Created Avenia pay-out quote for mint transfer.");

    const aveniaTicket = await brlaApiService.createPixInputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          walletAddress: state.state.evmEphemeralAddress,
          walletChain: AveniaPaymentMethod.MOONBEAM
        }
      },
      taxIdRecord.subAccountId
    );

    const expectedAmountReceived = quote.metadata.aveniaTransfer?.outputAmountRaw;

    logger.info(
      `BrlaOnrampMintHandler: Created Avenia transfer ticket with id ${aveniaTicket.id} to transfer ${quote.metadata.aveniaTransfer.outputAmountDecimal} BRLA to Moonbeam address ${state.state.evmEphemeralAddress}`
    );

    try {
      const pollingTimeMs = 1000;
      const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

      await checkEvmBalancePeriodically(
        tokenDetails.moonbeamErc20Address,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Moonbeam
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaOnrampMintHandler: phase timeout reached with error: ${error}`)
        : new Error(`Error checking Moonbeam balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaOnrampMintHandler: Phase not found in history. State corrupted.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    if (initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new BrlaOnrampMintHandler();
