import {
  BlockchainSendMethod,
  BrlaApiService,
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
import TaxId from "../../../../models/taxId.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class BrlaPayoutOnMoonbeamPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaPayoutOnMoonbeam";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, pixDestination, outputAmountBeforeFinalStep, outputTokenType, receiverTaxId, moonbeamEphemeralAddress } =
      state.state as StateMetadata;

    if (!taxId || !pixDestination || !outputAmountBeforeFinalStep || !outputTokenType || !moonbeamEphemeralAddress) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: SubaccountId must exist at this stage. This is a bug.");
    }

    if (!isFiatTokenEnum(outputTokenType)) {
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Invalid token type.");
    }

    const brlaApiService = BrlaApiService.getInstance();

    const pollForSufficientBalance = async () => {
      const pollInterval = 5000; // 5 seconds
      const timeout = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();
      let lastError: any;

      while (Date.now() - startTime < timeout) {
        try {
          const balanceResponse = await brlaApiService.getAccountBalance(taxIdRecord.subAccountId);
          if (balanceResponse && balanceResponse.balances && balanceResponse.balances.BRLA !== undefined) {
            if (new Big(balanceResponse.balances.BRLA).gte(outputAmountBeforeFinalStep.units)) {
              logger.info(`Sufficient BRLA balance found: ${balanceResponse.balances.BRLA}`);
              return balanceResponse;
            }
            logger.info(
              `Insufficient BRLA balance. Needed units: ${
                outputAmountBeforeFinalStep.units
              }, have (in units): ${new Big(balanceResponse.balances.BRLA).toString()}. Retrying in 5s...`
            );
          }
        } catch (error) {
          lastError = error;
          logger.warn(`Polling for balance failed with error. Retrying...`, lastError);
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      if (lastError) {
        logger.error("BrlaPayoutOnMoonbeamPhaseHandler: Polling for balance failed: ", lastError);
        throw lastError;
      }
      throw new Error(
        `BrlaPayoutOnMoonbeamPhaseHandler: Balance check timed out after 5 minutes. Needed ${outputAmountBeforeFinalStep.units} units.`
      );
    };

    await pollForSufficientBalance();

    try {
      const amount = new Big(outputAmountBeforeFinalStep.units); // TODOBefore Avenia, this has to be multiplied by 100. Still relevant?
      const subaccount = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
      if (!subaccount) {
        throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Subaccount must exist.");
      }
      const subaccountEvmAddress = subaccount.wallets.filter(wallet => wallet.chain === "EVM")[0];

      const amountForQuote = amount.round(2, 0); // Round down to 2 decimal places
      const payOutQuote = await brlaApiService.createPayOutQuote({
        outputAmount: amountForQuote.toString(),
        outputThirdParty: false,
        subAccountId: taxIdRecord.subAccountId
      });

      logger.debug("Debug: payOutQuote", payOutQuote);
      const payOutTicketParams: PixOutputTicketPayload = {
        quoteToken: payOutQuote.quoteToken,
        ticketBlockchainInput: {
          walletAddress: subaccountEvmAddress.walletAddress
        },
        ticketBrlPixOutput: {
          pixKey: pixDestination
        }
      };

      const { id: payOutTicketId } = await brlaApiService.createPixOutputTicket(payOutTicketParams, taxIdRecord.subAccountId);
      logger.debug("Debug: payOutTicketId", payOutTicketId);

      // Avenia migration: implement a wait and check after the request, or ticket follow-up.

      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      console.error("Error in brlaPayoutOnMoonbeam", e);
      throw new Error("BrlaPayoutOnMoonbeamPhaseHandler: Failed to trigger BRLA offramp.");
    }
  }
}

export default new BrlaPayoutOnMoonbeamPhaseHandler();
