import { FiatToken, getAnyFiatTokenDetailsMoonbeam, RampPhase } from "@packages/shared";
import Big from "big.js";

import { moonbeam } from "viem/chains";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BrlaApiService } from "../../brla/brlaApiService";
import { BrlaTeleportService } from "../../brla/brlaTeleportService";
import { generateReferenceLabel } from "../../brla/helpers";
import { BalanceCheckError, BalanceCheckErrorType, checkEvmBalancePeriodically } from "../../moonbeam/balance";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

// The rationale for these difference is that it allows for a finer check over the payment timeout in
// case of service restart. A smaller timeout for the balance check loop allows to get out to the outer
// process loop and check for the operation timestamp.
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class BrlaTeleportPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaTeleport";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, moonbeamEphemeralAddress, inputAmountUnits, inputAmountBeforeSwapRaw } = state.state as StateMetadata;

    if (!taxId || !moonbeamEphemeralAddress || !inputAmountUnits || !inputAmountBeforeSwapRaw) {
      throw new Error("BrlaTeleportPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const teleportService = BrlaTeleportService.getInstance();
    let subaccountId: string;
    let memo: string;

    try {
      const inputAmountBrla = new Big(inputAmountUnits).mul(100); // BRLA understands raw amount with 2 decimal places.

      const brlaApiService = BrlaApiService.getInstance();
      const subaccount = await brlaApiService.getSubaccount(taxId);

      if (!subaccount) {
        throw new Error("Subaccount not found");
      }
      subaccountId = subaccount.id;

      memo = generateReferenceLabel(state.quoteId);
      logger.info(
        `Requesting teleport for ${subaccountId} with ${inputAmountBrla} BRLA to ${moonbeamEphemeralAddress} and memo ${memo}`
      );

      await teleportService.requestTeleport(
        subaccountId,
        Number(inputAmountBrla),
        moonbeamEphemeralAddress as `0x${string}`,
        memo
      );

      // now we wait and verify that funds have arrived at the actual destination ephemeral.
    } catch (e) {
      logger.error("Error in brlaTeleport", e);
      throw new Error(
        `BrlaTeleportPhaseHandler: Failed to trigger BRLA pay in. Cause: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    try {
      const pollingTimeMs = 1000;

      const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

      await checkEvmBalancePeriodically(
        tokenDetails.moonbeamErc20Address,
        moonbeamEphemeralAddress,
        inputAmountBeforeSwapRaw,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        moonbeam
      );

      // Add delay to ensure the transaction is settled
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds.
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");

        teleportService.cancelPendingTeleport(subaccountId, memo);
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaTeleportPhaseHandler: ${error}`)
        : new Error(`Error checking Moonbeam balance: ${error}`);
    }

    return this.transitionToNextPhase(state, "fundEphemeral");
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaTeleportPhaseHandler: Phase not found in history. State corrupted.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    if (initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new BrlaTeleportPhaseHandler();
