import { FiatToken, RampPhase } from "@packages/shared";
import { nativeToDecimal } from "@packages/shared/src/helpers/parseNumbers";
import Big from "big.js";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { SubsidyToken } from "../../../../models/subsidy.model";
import { getFundingAccount } from "../../../controllers/subsidize.controller";
import { ApiManager } from "../../pendulum/apiManager";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class SubsidizePostSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePostSwap";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const { pendulumEphemeralAddress, outputTokenPendulumDetails, outputAmountBeforeFinalStep, outputTokenType } =
      state.state as StateMetadata;

    if (!pendulumEphemeralAddress || !outputTokenPendulumDetails || !outputAmountBeforeFinalStep || !outputTokenType) {
      throw new Error("SubsidizePostSwapPhaseHandler: State metadata corrupted. This is a bug.");
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        pendulumEphemeralAddress,
        outputTokenPendulumDetails.currencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on pendulum");
      }

      const requiredAmount = Big(outputAmountBeforeFinalStep.raw).sub(currentBalance);
      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        logger.info(
          `Subsidizing post-swap with ${requiredAmount.toFixed()} to reach target value of ${outputAmountBeforeFinalStep.raw}`
        );
        const fundingAccountKeypair = getFundingAccount();
        const txHash = await pendulumNode.api.tx.tokens
          .transfer(pendulumEphemeralAddress, outputTokenPendulumDetails.currencyId, requiredAmount.toFixed(0, 0))
          .signAndSend(fundingAccountKeypair);

        const subsidyAmount = nativeToDecimal(requiredAmount, outputTokenPendulumDetails.decimals).toNumber();
        const subsidyToken = outputTokenPendulumDetails.assetSymbol as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccountKeypair.address, txHash.toString());
      }

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
    } catch (e) {
      logger.error("Error in subsidizePostSwap:", e);
      throw new Error("SubsidizePostSwapPhaseHandler: Failed to subsidize post swap.");
    }
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // onramp cases
    if (state.type === "on") {
      if (state.to === "assethub") {
        return "pendulumToAssethub";
      }
      return "pendulumToMoonbeam";
    }

    // off ramp cases
    if (state.state.outputTokenType === FiatToken.BRL) {
      return "pendulumToMoonbeam";
    }
    return "spacewalkRedeem";
  }
}

export default new SubsidizePostSwapPhaseHandler();
