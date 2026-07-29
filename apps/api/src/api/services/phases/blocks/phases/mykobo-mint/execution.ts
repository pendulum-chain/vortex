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
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { getBlockMetadata } from "../../core/metadata";
import { MykoboMintContext } from "./simulation";

const PAYMENT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95;

export class MykoboOnrampDepositExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboOnrampDeposit";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("MykoboOnrampDepositExecutor: Missing EVM ephemeral address");
    }
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("MykoboOnrampDepositExecutor: Quote not found");
    }
    const metadata = getBlockMetadata(quote.metadata, MykoboMintContext);
    const token = evmTokenConfig[Networks.Base][EvmToken.EURC];
    if (!token) {
      throw new Error("MykoboOnrampDepositExecutor: EURC token details not found for Base");
    }
    const expectedAmountRaw = metadata.mint.outputAmountRaw;
    const recoveryThresholdRaw = new Big(expectedAmountRaw).mul(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);
    if (await this.ephemeralAlreadyFunded(token.erc20AddressSourceChain, evmEphemeralAddress, recoveryThresholdRaw)) {
      logger.info(`MykoboOnrampDepositExecutor: Base ephemeral already holds at least 95% of ${expectedAmountRaw} EURC`);
      return state;
    }
    try {
      await checkEvmBalancePeriodically(
        token.erc20AddressSourceChain,
        evmEphemeralAddress,
        expectedAmountRaw,
        POLL_INTERVAL_MS,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Base,
        signal
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) {
        throw new Error(`MykoboOnrampDepositExecutor: Error checking Base EURC balance: ${error}`);
      }
      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("MykoboOnrampDepositExecutor: Payment timeout reached. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }
      throw isCheckTimeout
        ? this.createRecoverableError(`MykoboOnrampDepositExecutor: balance-check timeout waiting for settlement: ${error}`)
        : new Error(`MykoboOnrampDepositExecutor: Error checking Base EURC balance: ${error}`);
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
      logger.warn(`MykoboOnrampDepositExecutor: balance pre-check failed, falling back to wait loop: ${error}`);
      return false;
    }
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const phase = state.phaseHistory.find(entry => entry.phase === this.getPhaseName());
    if (!phase) {
      throw new Error("MykoboOnrampDepositExecutor: Phase not found in history");
    }
    return new Date(phase.timestamp).getTime() + PAYMENT_TIMEOUT_MS < Date.now();
  }
}
