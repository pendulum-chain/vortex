import { getAnyFiatTokenDetailsMoonbeam, isFiatTokenEnum, RampPhase } from "@packages/shared";
import Big from "big.js";

import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BrlaApiService } from "../../brla/brlaApiService";
import { checkEvmBalancePeriodically } from "../../moonbeam/balance";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class BrlaPayoutOnMoonbeamPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnMoonbeam";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, pixDestination, outputAmountBeforeFinalStep, brlaEvmAddress, outputTokenType, receiverTaxId } =
      state.state as StateMetadata;

    if (!taxId || !pixDestination || !outputAmountBeforeFinalStep || !brlaEvmAddress || !outputTokenType) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: State metadata corrupted. This is a bug.");
    }

    if (!isFiatTokenEnum(outputTokenType)) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Invalid token type.");
    }

    const tokenDetails = getAnyFiatTokenDetailsMoonbeam(outputTokenType);

    const pollingTimeMs = 1000;
    const maxWaitingTimeMs = 5 * 60 * 1000; // 5 minutes

    try {
      await checkEvmBalancePeriodically(
        tokenDetails.polygonErc20Address,
        brlaEvmAddress,
        outputAmountBeforeFinalStep.raw,
        pollingTimeMs,
        maxWaitingTimeMs,
        "polygon"
      );
    } catch (balanceCheckError) {
      if (balanceCheckError instanceof Error) {
        if (balanceCheckError.message === "Balance did not meet the limit within the specified time") {
          throw new Error(`BrlaPayoutOnMoonbeamPhaseHandler: balanceCheckError ${balanceCheckError.message}`);
        } else {
          logger.error("Error checking Polygon balance:", balanceCheckError);
          throw new Error("Error checking Polygon balance");
        }
      }
    }

    try {
      const amount = new Big(outputAmountBeforeFinalStep.units).mul(100); // BRLA understands raw amount with 2 decimal places.

      const brlaApiService = BrlaApiService.getInstance();
      const subaccount = await brlaApiService.getSubaccount(taxId);

      if (!subaccount) {
        throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Subaccount not found.");
      }

      const subaccountId = subaccount.id;
      await brlaApiService.triggerOfframp(subaccountId, {
        amount: Number(amount),
        pixKey: pixDestination,
        taxId: receiverTaxId
      });

      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      console.error("Error in brlaPayoutOnMoonbeam", e);
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Failed to trigger BRLA offramp.");
    }
  }
}

export default new BrlaPayoutOnMoonbeamPhaseHandler();
