import {
  AveniaPaymentMethod,
  AveniaTicketStatus,
  BalanceCheckError,
  BalanceCheckErrorType,
  BlockchainSendMethod,
  BrlaApiError,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  EvmAddress,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  getEvmTokenBalance,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import FinancialOperation from "../../../../../../models/financialOperation.model";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { findAveniaCustomerByTaxId } from "../../../../avenia/avenia-customer.service";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { SlackNotifier } from "../../../../slack.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { isAnchorMockingEnabled } from "../anchor-test-mode";
import { syncAveniaOnHoldState } from "./on-hold";
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
const MINT_TICKET_ATTEMPT_CLASS = "provider-mint-ticket";

// Pay-in ticket statuses that show Avenia has received the Pix (or holds it for compliance review).
const RECEIVED_PAYIN_STATUSES = new Set<string>([
  AveniaTicketStatus.PROCESSING,
  AveniaTicketStatus.ON_HOLD,
  AveniaTicketStatus.PAID
]);

export class BrlaOnrampMintExecutor extends BasePhaseHandler {
  /** One instance, so its cooldown repeats an identical alert at most every six hours. */
  private slackNotifier?: SlackNotifier;

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

    const isMoonbeam = metadata.network === Networks.Moonbeam;
    const baseToken = evmTokenConfig[Networks.Base][EvmToken.BRLA];
    const moonbeamToken = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
    let tokenAddress: string;
    let tokenDecimals: number;
    if (isMoonbeam) {
      tokenAddress = moonbeamToken.moonbeamErc20Address;
      tokenDecimals = moonbeamToken.decimals;
    } else {
      if (!baseToken) throw new Error("BRLA token details not found for Base network");
      tokenAddress = baseToken.erc20AddressSourceChain;
      tokenDecimals = baseToken.decimals;
    }
    const network = isMoonbeam ? Networks.Moonbeam : Networks.Base;
    const paymentMethod = isMoonbeam ? AveniaPaymentMethod.MOONBEAM : AveniaPaymentMethod.BASE;

    const preComputedExpectedAmountRaw = metadata.transfer.outputAmountRaw;

    if (isAnchorMockingEnabled()) {
      logger.warn(
        `BrlaOnrampMintExecutor: Mocking Avenia mint; send ${preComputedExpectedAmountRaw} raw BRLA on ${network} to ${evmEphemeralAddress}`
      );
      try {
        await checkEvmBalancePeriodically(
          tokenAddress,
          evmEphemeralAddress,
          preComputedExpectedAmountRaw,
          1000,
          EVM_BALANCE_CHECK_TIMEOUT_MS,
          network,
          signal
        );
      } catch (error) {
        if (error instanceof BalanceCheckError && error.type === BalanceCheckErrorType.Timeout) {
          throw this.createRecoverableError(`BrlaOnrampMintExecutor: Mock mint balance check timed out: ${error}`);
        }
        throw error;
      }
      return state;
    }

    const preparation = getBlockState<AveniaMintPreparation>(state.state, AveniaMintContext);
    if (!preparation.taxId) {
      throw new Error("BrlaOnrampMintExecutor: Missing Avenia tax ID in block state");
    }
    let aveniaSubAccountId = preparation.subAccountId;
    if (!aveniaSubAccountId) {
      // Compatibility fallback for ramps registered before subaccount identity was snapshotted.
      const aveniaCustomer = await findAveniaCustomerByTaxId(preparation.taxId);
      if (!aveniaCustomer) {
        throw new APIError({
          message: "Subaccount not found",
          status: httpStatus.BAD_REQUEST
        });
      }
      aveniaSubAccountId = aveniaCustomer.providerSubaccountId ?? "";
    }

    // Recovery shortcut: a previous run may have already minted on Avenia and transferred to the
    // ephemeral. It applies only once this ramp has its own mint ticket, so a balance alone never
    // stands in for the Pix. Accept a balance of at least 95% of the pre-computed expected amount.
    const recoveryThresholdRaw = new Big(preComputedExpectedAmountRaw).times(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);
    const mintTicket = await FinancialOperation.findOne({
      where: {
        attemptClass: MINT_TICKET_ATTEMPT_CLASS,
        phase: this.getPhaseName(),
        provider: "avenia",
        scopeId: state.id,
        scopeType: "ramp",
        status: ["submitted", "unknown", "confirmed"]
      }
    });

    if (
      mintTicket &&
      (await this.ephemeralAlreadyFunded(tokenAddress, evmEphemeralAddress, recoveryThresholdRaw, network, signal))
    ) {
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
            await abortableCall(signal, () =>
              syncAveniaOnHoldState(
                state.state,
                updatedState => state.update({ state: { ...state.state, ...updatedState } }),
                brlaApiService,
                aveniaSubAccountId
              )
            );
          }
          const { balances } = await abortableCall(signal, () => brlaApiService.getAccountBalance(aveniaSubAccountId));
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
      if (isCheckTimeout && (await this.isPaymentWindowClosed(state, brlaApiService, aveniaSubAccountId))) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(
            `BrlaOnrampMintExecutor: phase timeout reached waiting for Avenia balance with error: ${error}`
          )
        : new Error(`Error checking Avenia balance: ${error}`);
    }

    const operationResult = await this.runFinancialOperation(state, {
      attemptClass: MINT_TICKET_ATTEMPT_CLASS,
      externalId: result => result.ticketId,
      perform: async () => {
        const aveniaQuote = await abortableCall(signal, () =>
          brlaApiService.createPayInQuote({
            blockchainSendMethod: BlockchainSendMethod.PERMIT,
            inputAmount: Big(metadata.mint.outputAmountDecimal).toFixed(2, 0),
            inputCurrency: BrlaCurrency.BRLA,
            inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
            inputThirdParty: false,
            outputCurrency: BrlaCurrency.BRLA,
            outputPaymentMethod: paymentMethod,
            outputThirdParty: false,
            subAccountId: aveniaSubAccountId
          })
        );
        const expectedAmountReceived = multiplyByPowerOfTen(new Big(aveniaQuote.outputAmount), tokenDecimals).toFixed(0, 0);
        throwIfAborted(signal);
        const aveniaTicket = await abortableCall(signal, () =>
          brlaApiService.createPixOutputTicket(
            {
              quoteToken: aveniaQuote.quoteToken,
              ticketBlockchainOutput: {
                walletAddress: state.state.evmEphemeralAddress,
                walletChain: paymentMethod
              }
            },
            aveniaSubAccountId
          )
        );
        return { expectedAmountReceived, outputAmount: aveniaQuote.outputAmount, ticketId: aveniaTicket.id };
      },
      provider: "avenia",
      request: {
        amount: Big(metadata.mint.outputAmountDecimal).toFixed(2, 0),
        destination: evmEphemeralAddress,
        network,
        subAccountId: aveniaSubAccountId
      },
      signal
    });
    const { expectedAmountReceived, outputAmount, ticketId } = operationResult;

    logger.info(
      `BrlaOnrampMintExecutor: Avenia transfer ticket ${ticketId} will transfer ${outputAmount} BRLA to ${network} address ${state.state.evmEphemeralAddress}. Expected raw amount ${expectedAmountReceived}; quote-time amount was ${preComputedExpectedAmountRaw}.`
    );

    try {
      const pollingTimeMs = 1000;

      await checkEvmBalancePeriodically(
        tokenAddress,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        network,
        signal
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && (await this.isPaymentWindowClosed(state, brlaApiService, aveniaSubAccountId))) {
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
    expectedAmountRaw: string,
    chain: typeof Networks.Base | typeof Networks.Moonbeam,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      const balance = await abortableCall(signal, () =>
        getEvmTokenBalance({
          chain,
          ownerAddress: ownerAddress as EvmAddress,
          tokenAddress: tokenAddress as EvmAddress
        })
      );
      return balance.gte(new Big(expectedAmountRaw));
    } catch (error) {
      throwIfAborted(signal);
      // Treat read failures as "not funded" so we fall through to the regular flow rather than
      // aborting the phase on a transient RPC error.
      logger.warn(
        `BrlaOnrampMintExecutor: ephemeral balance pre-check failed for ${ownerAddress}, falling back to Avenia flow: ${error}`
      );
      return false;
    }
  }

  /**
   * The payment window cancels only a ramp whose Pix Avenia has not received. Once the ramp's own pay-in
   * ticket is processing, held for compliance review, or paid, the ramp keeps waiting for the BRLA and
   * operators are alerted. A ramp without a pay-in ticket that Avenia knows has received nothing.
   */
  private async isPaymentWindowClosed(
    state: RampState,
    brlaApiService: BrlaApiService,
    subAccountId: string
  ): Promise<boolean> {
    if (!this.isPaymentTimeoutReached(state)) return false;
    const ticketId = state.state.aveniaTicketId;
    if (!ticketId) return true;
    let status: string;
    try {
      status = (await brlaApiService.getAveniaPayinTicket(ticketId, subAccountId)).status.trim().toUpperCase();
    } catch (error) {
      if (error instanceof BrlaApiError && error.status === 404) return true;
      throw this.createRecoverableError(`BrlaOnrampMintExecutor: could not read the Avenia pay-in ticket: ${error}`);
    }
    if (!RECEIVED_PAYIN_STATUSES.has(status)) return true;

    await this.alertWaitingPastWindow(state.id, status);
    return false;
  }

  /** A failed alert is only logged. */
  private async alertWaitingPastWindow(rampId: string, ticketStatus: string): Promise<void> {
    if (!this.slackNotifier && config.integrations.slack.webhookToken) this.slackNotifier = new SlackNotifier();
    try {
      await this.slackNotifier?.sendMessage({
        text: `Ramp ${rampId} is past its Pix payment window with pay-in ticket status ${ticketStatus} and is still waiting for its BRLA mint.`
      });
    } catch (error) {
      logger.warn(`Payment-window alert for ${rampId} failed: ${error instanceof Error ? error.message : String(error)}`);
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
