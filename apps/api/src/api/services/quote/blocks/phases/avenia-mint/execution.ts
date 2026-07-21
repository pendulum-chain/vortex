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
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { findAveniaCustomerByTaxId } from "../../../../avenia/avenia-customer.service";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { syncAveniaOnHoldState } from "../../../../phases/helpers/brla-onramp-hold";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { AveniaMintContext } from "./simulation";
import type { AveniaMintPreparation } from "./transactions";

const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const AVENIA_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AVENIA_HOLD_STATUS_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

// The pre-computed expected amount stored at quote-creation time can be slightly higher than the
// amount actually transferred due to fee differences at execution time. We allow a 5% tolerance
// in the recovery shortcut so that an already-funded ephemeral is not missed.
const EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95;

export class BrlaOnrampMintExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaOnrampMint";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("BrlaOnrampMintExecutor: State metadata corrupted. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, AveniaMintContext);

    const preparation = getBlockState<AveniaMintPreparation>(state.state, AveniaMintContext);
    if (!preparation.taxId) {
      throw new Error("BrlaOnrampMintExecutor: Missing Avenia tax ID in block state");
    }
    const aveniaCustomer = await findAveniaCustomerByTaxId(preparation.taxId);
    if (!aveniaCustomer) {
      throw new APIError({
        message: "Subaccount not found",
        status: httpStatus.BAD_REQUEST
      });
    }
    const aveniaSubAccountId = aveniaCustomer.providerSubaccountId ?? "";

    const tokenDetails = evmTokenConfig[Networks.Base][EvmToken.BRLA];
    if (!tokenDetails) {
      throw new Error("BRLA token details not found for Base network");
    }

    const preComputedExpectedAmountRaw = metadata.transfer.outputAmountRaw;

    // Recovery shortcut: a previous run may have already minted on Avenia and transferred to the
    // ephemeral. Accept a balance of at least 95% of the pre-computed expected amount.
    const recoveryThresholdRaw = new Big(preComputedExpectedAmountRaw).times(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);

    if (await this.ephemeralAlreadyFunded(tokenDetails.erc20AddressSourceChain, evmEphemeralAddress, recoveryThresholdRaw)) {
      logger.info(
        `BrlaOnrampMintExecutor: Ephemeral ${evmEphemeralAddress} already holds at least 95% of the expected ${preComputedExpectedAmountRaw} BRLA (threshold: ${recoveryThresholdRaw}). Skipping mint flow.`
      );
      return state;
    }

    const brlaApiService = BrlaApiService.getInstance();
    let lastAveniaHoldStatusCheckAt = 0;
    try {
      logger.info(
        `BrlaOnrampMintExecutor: Waiting for Avenia balance to have at least ${metadata.mint.outputAmountDecimal} BRL`
      );
      await waitUntilTrueWithTimeout(
        async () => {
          const now = Date.now();
          if (now - lastAveniaHoldStatusCheckAt >= AVENIA_HOLD_STATUS_CHECK_INTERVAL_MS) {
            lastAveniaHoldStatusCheckAt = now;
            await syncAveniaOnHoldState(
              state.state,
              updatedState => state.update({ state: { ...state.state, ...updatedState } }),
              brlaApiService,
              aveniaSubAccountId
            );
          }
          const { balances } = await brlaApiService.getAccountBalance(aveniaSubAccountId);
          if (!balances || balances.BRLA === undefined || balances.BRLA === null) {
            return false;
          }
          return Number(balances.BRLA) >= Number(Big(metadata.mint.outputAmountDecimal).toFixed(2, 0));
        },
        5000,
        AVENIA_BALANCE_CHECK_TIMEOUT_MS,
        signal
      );
    } catch (error) {
      const isCheckTimeout = error instanceof Error && error.message.includes("Timeout");
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(
            `BrlaOnrampMintExecutor: phase timeout reached waiting for Avenia balance with error: ${error}`
          )
        : new Error(`Error checking Avenia balance: ${error}`);
    }

    // Transfer the funds from the subaccount to the ephemeral address
    const aveniaQuote = await brlaApiService.createPayInQuote({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputAmount: Big(metadata.mint.outputAmountDecimal).toFixed(2, 0),
      inputCurrency: BrlaCurrency.BRLA,
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.BASE,
      outputThirdParty: false,
      subAccountId: aveniaSubAccountId
    });

    logger.info("BrlaOnrampMintExecutor: Created Avenia pay-out quote for mint transfer.");

    // Derive the expected on-chain amount from the live quote rather than the stale pre-computed
    // metadata value: the live quote accounts for the fees actually applied at execution time.
    const expectedAmountReceived = multiplyByPowerOfTen(new Big(aveniaQuote.outputAmount), tokenDetails.decimals).toFixed(0, 0);

    logger.info(
      `BrlaOnrampMintExecutor: Live Avenia quote output is ${aveniaQuote.outputAmount} BRLA (raw: ${expectedAmountReceived}). Pre-computed metadata value was ${preComputedExpectedAmountRaw}.`
    );

    const aveniaTicket = await brlaApiService.createPixOutputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          walletAddress: state.state.evmEphemeralAddress,
          walletChain: AveniaPaymentMethod.BASE
        }
      },
      aveniaSubAccountId
    );

    logger.info(
      `BrlaOnrampMintExecutor: Created Avenia transfer ticket with id ${aveniaTicket.id} to transfer ${aveniaQuote.outputAmount} BRLA to Base address ${state.state.evmEphemeralAddress}`
    );

    try {
      const pollingTimeMs = 1000;

      await checkEvmBalancePeriodically(
        tokenDetails.erc20AddressSourceChain,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Base,
        signal
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaOnrampMintExecutor: phase timeout reached with error: ${error}`)
        : new Error(`Error checking Base balance: ${error}`);
    }

    return state;
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
      // Treat read failures as "not funded" so we fall through to the regular flow rather than
      // aborting the phase on a transient RPC error.
      logger.warn(
        `BrlaOnrampMintExecutor: ephemeral balance pre-check failed for ${ownerAddress}, falling back to Avenia flow: ${error}`
      );
      return false;
    }
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaOnrampMintExecutor: Phase not found in history. This is a bug.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    return initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now();
  }
}
