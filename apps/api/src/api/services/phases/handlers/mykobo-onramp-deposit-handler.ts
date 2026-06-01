import {
  BalanceCheckError,
  BalanceCheckErrorType,
  checkEvmBalancePeriodically,
  EvmAddress,
  EvmToken,
  evmTokenConfig,
  getEvmTokenBalance,
  Networks,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// Mykobo SEPA settlement can take significantly longer than card-based onramps.
// 24h is a generous upper bound matching SEPA business-day cutoffs.
const PAYMENT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

// The pre-computed deliveredEurc value stored at quote-creation time can be slightly
// higher than the amount actually transferred due to fee differences at execution time.
// Allow 5% tolerance in the recovery shortcut so an already-funded ephemeral is not missed.
const EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95;

// Phase description: wait for the EURC to arrive at the Base ephemeral address from Mykobo's
// SEPA→on-chain settlement. If the timeout is reached, we assume the user has NOT made the
// SEPA transfer and we cancel the ramp.
export class MykoboOnrampDepositHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboOnrampDeposit";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("MykoboOnrampDepositHandler: Missing evmEphemeralAddress in state. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("MykoboOnrampDepositHandler: Quote not found for the given state.");
    }

    if (!quote.metadata.mykoboMint?.outputAmountRaw) {
      throw new Error("MykoboOnrampDepositHandler: Missing 'mykoboMint.outputAmountRaw' in quote metadata.");
    }

    const tokenDetails = evmTokenConfig[Networks.Base][EvmToken.EURC];
    if (!tokenDetails) {
      throw new Error("MykoboOnrampDepositHandler: EURC token details not found for Base network.");
    }

    const expectedAmountRaw = quote.metadata.mykoboMint.outputAmountRaw;

    // Recovery shortcut: a previous run may have already received Mykobo's settlement on the
    // ephemeral. Accept a balance of at least 95% of the pre-computed expected amount to account
    // for any fee variance between quote-creation time and settlement.
    const recoveryThresholdRaw = new Big(expectedAmountRaw).times(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);

    if (await this.ephemeralAlreadyFunded(tokenDetails.erc20AddressSourceChain, evmEphemeralAddress, recoveryThresholdRaw)) {
      logger.info(
        `MykoboOnrampDepositHandler: Ephemeral ${evmEphemeralAddress} already holds at least 95% of the expected ${expectedAmountRaw} EURC (threshold: ${recoveryThresholdRaw}). Skipping deposit wait.`
      );
      return this.transitionToNextPhase(state, "fundEphemeral");
    }

    logger.info(
      `MykoboOnrampDepositHandler: Waiting for ${expectedAmountRaw} (raw, ${tokenDetails.decimals} decimals) EURC ` +
        `on Base at ephemeral address ${evmEphemeralAddress}.`
    );

    try {
      await checkEvmBalancePeriodically(
        tokenDetails.erc20AddressSourceChain,
        evmEphemeralAddress,
        expectedAmountRaw,
        POLL_INTERVAL_MS,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Base
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) {
        throw new Error(`MykoboOnrampDepositHandler: Error checking Base EURC balance: ${error}`);
      }

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("MykoboOnrampDepositHandler: Payment timeout reached. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(
            `MykoboOnrampDepositHandler: balance-check timeout reached waiting for Mykobo settlement: ${error}`
          )
        : new Error(`MykoboOnrampDepositHandler: Error checking Base EURC balance: ${error}`);
    }

    logger.info(
      `MykoboOnrampDepositHandler: EURC deposit received on Base ephemeral ${evmEphemeralAddress}. Proceeding to fundEphemeral.`
    );

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
      // Treat read failures as "not funded" so we fall through to the regular flow
      // rather than aborting the phase on a transient RPC error.
      logger.warn(
        `MykoboOnrampDepositHandler: ephemeral balance pre-check failed for ${ownerAddress}, falling back to wait loop: ${error}`
      );
      return false;
    }
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("MykoboOnrampDepositHandler: Phase not found in history. This is a bug.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    return initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now();
  }
}

export default new MykoboOnrampDepositHandler();
