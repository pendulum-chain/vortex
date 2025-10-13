import { ApiManager, getNetworkFromDestination, getPendulumDetails, RampPhase } from "@packages/shared";
import { nativeToDecimal } from "@packages/shared/src/helpers/parseNumbers";
import Big from "big.js";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class SubsidizePreSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const quote = await QuoteTicket.findByPk(state.quoteId);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!substrateEphemeralAddress) {
      throw new Error("SubsidizePreSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const fromNetwork = getNetworkFromDestination(quote.from);
    if (!fromNetwork) {
      throw new Error(`Invalid network for source ${quote.from}`);
    }
    const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);

    if (!quote.metadata.nablaSwap?.inputAmountForSwapRaw) {
      throw new Error("Missing input amount before swap in quote metadata");
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        inputTokenPendulumDetails.currencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      const expectedInputAmountForSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        logger.info(
          `Subsidizing pre-swap with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );
        const fundingAccountKeypair = getFundingAccount();

        // TODO this and other calls, add to executeApiCall to avoid low priority errors.
        const txHash = await pendulumNode.api.tx.tokens
          .transfer(substrateEphemeralAddress, inputTokenPendulumDetails.currencyId, requiredAmount.toFixed(0, 0))
          .signAndSend(fundingAccountKeypair);

        const subsidyAmount = nativeToDecimal(requiredAmount, inputTokenPendulumDetails.decimals).toNumber();
        const subsidyToken = inputTokenPendulumDetails.assetSymbol as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, txHash.toString());
      }

      return this.transitionToNextPhase(state, "nablaApprove");
    } catch (e) {
      console.error("Error in subsidizePreSwap:", e);
      throw new Error("SubsidizePreSwapPhaseHandler: Failed to subsidize pre swap.");
    }
  }
}

export default new SubsidizePreSwapPhaseHandler();
