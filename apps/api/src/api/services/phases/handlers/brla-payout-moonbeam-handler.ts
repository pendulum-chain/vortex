import {
  BlockchainSendMethod,
  BrlaApiService,
  BrlaPaymentMethod,
  checkEvmBalancePeriodically,
  getAnyFiatTokenDetailsMoonbeam,
  isFiatTokenEnum,
  Networks,
  PixOutputTicketPayload,
  RampPhase
} from "@packages/shared";
import Big from "big.js";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class BrlaPayoutOnMoonbeamPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnMoonbeam";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const {
      taxId,
      pixDestination,
      outputAmountBeforeFinalStep,
      brlaEvmAddress,
      outputTokenType,
      receiverTaxId,
      moonbeamEphemeralAddress
    } = state.state as StateMetadata;

    if (
      !taxId ||
      !pixDestination ||
      !outputAmountBeforeFinalStep ||
      !brlaEvmAddress ||
      !outputTokenType ||
      !moonbeamEphemeralAddress
    ) {
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
        Networks.Polygon
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
      const subaccount = await brlaApiService.subaccountInfo(taxId);

      if (!subaccount) {
        throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Subaccount not found.");
      }
      const subaccountEvmAddress = subaccount.wallets.filter(wallet => wallet.chain === "EVM")[0];
      const payOutQuote = await brlaApiService.createPayOutQuote({
        outputAmount: amount.toString(),
        outputThirdParty: false
      });

      const payOutTicketParams: PixOutputTicketPayload = {
        quoteToken: payOutQuote.quoteToken,
        ticketBlockchainInput: {
          walletAddress: subaccountEvmAddress.walletAddress
        },
        ticketBrlPixOutput: {
          pixKey: pixDestination
        }
      };

      const { id: payOutTicketId } = await brlaApiService.createPixOutputTicket(payOutTicketParams);
      // Avenia migration: implement a wait and check after the request, or ticket follow-up.

      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      console.error("Error in brlaPayoutOnMoonbeam", e);
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Failed to trigger BRLA offramp.");
    }
  }
}

export default new BrlaPayoutOnMoonbeamPhaseHandler();
