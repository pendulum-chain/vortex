import {
  AveniaPaymentMethod,
  BalanceCheckError,
  BalanceCheckErrorType,
  BlockchainSendMethod,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  EvmAddress,
  EvmToken,
  evmTokenConfig,
  getEvmTokenBalance,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import TaxId from "../../../../models/taxId.model";
import { APIError } from "../../../errors/api-error";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";
import { syncAveniaOnHoldState } from "./brla-onramp-hold";

// The rationale for these difference is that it allows for a finer check over the payment timeout in
// case of service restart. A smaller timeout for the balance check loop allows to get out to the outer
// process loop and check for the operation timestamp.
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AVENIA_HOLD_STATUS_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

// The pre-computed expected amount stored at quote-creation time can be slightly higher than the
// amount actually transferred due to fee differences at execution time. We allow a 5% tolerance
// in the recovery shortcut so that an already-funded ephemeral is not missed.
const EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95;

// Phase description: wait for the tokens to arrive at the Base ephemeral address.
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

    const tokenDetails = evmTokenConfig[Networks.Base][EvmToken.BRLA];
    if (!tokenDetails) {
      throw new Error("BRLA token details not found for Base network");
    }

    // Used only for the recovery shortcut below: the pre-computed metadata value is a
    // reasonable upper-bound estimate of what should arrive at the ephemeral. The actual
    // amount is determined by the live Avenia quote created later in this phase.
    const preComputedExpectedAmountRaw = quote.metadata.aveniaTransfer.outputAmountRaw;

    // Recovery shortcut: a previous run may have already minted on Avenia and
    // transferred to the ephemeral. We accept a balance of at least 95% of the
    // pre-computed expected amount to account for fee differences between quote
    // creation time and execution time.
    const recoveryThresholdRaw = new Big(preComputedExpectedAmountRaw).times(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);

    if (await this.ephemeralAlreadyFunded(tokenDetails.erc20AddressSourceChain, evmEphemeralAddress, recoveryThresholdRaw)) {
      logger.info(
        `BrlaOnrampMintHandler: Ephemeral ${evmEphemeralAddress} already holds at least 95% of the expected ${preComputedExpectedAmountRaw} BRLA (threshold: ${recoveryThresholdRaw}). Skipping mint flow.`
      );
      return this.transitionToNextPhase(state, "fundEphemeral");
    }

    const brlaApiService = BrlaApiService.getInstance();
    let lastAveniaHoldStatusCheckAt = 0;
    try {
      logger.info(
        `BrlaOnrampMintHandler: Waiting for Avenia balance to have at least ${quote.metadata.aveniaMint.outputAmountDecimal} BRL`
      );
      await waitUntilTrueWithTimeout(
        async () => {
          if (!quote.metadata.aveniaMint) {
            return false;
          }

          const now = Date.now();
          if (now - lastAveniaHoldStatusCheckAt >= AVENIA_HOLD_STATUS_CHECK_INTERVAL_MS) {
            lastAveniaHoldStatusCheckAt = now;
            const ticketFound = await syncAveniaOnHoldState(
              state.state,
              updatedState =>
                state.update({
                  state: {
                    ...state.state,
                    ...updatedState
                  }
                }),
              brlaApiService,
              taxIdRecord.subAccountId
            );
            if (!ticketFound) {
              logger.warn(
                `BrlaOnrampMintHandler: Avenia ticket ${state.state.aveniaTicketId} was not found while checking hold status.`
              );
            }
          }

          // Check internal balance of Avenia subaccount
          const { balances } = await brlaApiService.getAccountBalance(taxIdRecord.subAccountId);
          if (!balances || balances.BRLA === undefined || balances.BRLA === null) {
            return false;
          }
          return Number(balances.BRLA) >= Number(Big(quote.metadata.aveniaMint.outputAmountDecimal).toFixed(2, 0));
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
      inputAmount: Big(quote.metadata.aveniaMint.outputAmountDecimal).toFixed(2, 0),
      inputCurrency: BrlaCurrency.BRLA,
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.BASE,
      outputThirdParty: false,
      subAccountId: taxIdRecord.subAccountId
    });

    logger.info("BrlaOnrampMintHandler: Created Avenia pay-out quote for mint transfer.");

    // Derive the expected on-chain amount from the live quote's outputAmount rather than
    // the stale pre-computed metadata value. The live quote accounts for the actual fees
    // applied at execution time, so this is the amount that will truly arrive on Base.
    const expectedAmountReceived = multiplyByPowerOfTen(new Big(aveniaQuote.outputAmount), tokenDetails.decimals).toFixed(0, 0);

    logger.info(
      `BrlaOnrampMintHandler: Live Avenia quote output is ${aveniaQuote.outputAmount} BRLA (raw: ${expectedAmountReceived}). Pre-computed metadata value was ${preComputedExpectedAmountRaw}.`
    );

    const aveniaTicket = await brlaApiService.createPixOutputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          walletAddress: state.state.evmEphemeralAddress,
          walletChain: AveniaPaymentMethod.BASE
        }
      },
      taxIdRecord.subAccountId
    );

    logger.info(
      `BrlaOnrampMintHandler: Created Avenia transfer ticket with id ${aveniaTicket.id} to transfer ${aveniaQuote.outputAmount} BRLA to Base address ${state.state.evmEphemeralAddress}`
    );

    try {
      const pollingTimeMs = 1000;

      await checkEvmBalancePeriodically(
        tokenDetails.erc20AddressSourceChain,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Base
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
        : new Error(`Error checking Base balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  private async ephemeralAlreadyFunded(
    tokenAddress: string,
    ownerAddress: string,
    expectedAmountRaw: string
  ): Promise<boolean> {
    try {
      const balance = await getEvmTokenBalance({
        chain: Networks.Base,
        ownerAddress: ownerAddress as EvmAddress,
        tokenAddress: tokenAddress as EvmAddress
      });
      return balance.gte(new Big(expectedAmountRaw));
    } catch (error) {
      // Treat read failures as "not funded" so we fall through to the regular
      // flow rather than aborting the phase on a transient RPC error.
      logger.warn(
        `BrlaOnrampMintHandler: ephemeral balance pre-check failed for ${ownerAddress}, falling back to Avenia flow: ${error}`
      );
      return false;
    }
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaOnrampMintHandler: Phase not found in history. This is a bug.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    if (initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new BrlaOnrampMintHandler();
