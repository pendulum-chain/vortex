import {
  AXL_USDC_MOONBEAM,
  decodeSubmittableExtrinsic,
  FiatToken,
  getAddressForFormat,
  getAnyFiatTokenDetailsMoonbeam,
  PENDULUM_USDC_AXL,
  RampPhase
} from "@packages/shared";
import Big from "big.js";
import { moonbeam } from "viem/chains";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { getEvmTokenBalance } from "../../moonbeam/balance";
import { ApiManager } from "../../pendulum/apiManager";
import { submitXTokens } from "../../xcm/send";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class PendulumToMoonbeamXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToMoonbeam";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");

    const { pendulumEphemeralAddress, moonbeamEphemeralAddress, brlaEvmAddress, outputAmountBeforeFinalStep } = state.state;

    if (!pendulumEphemeralAddress) {
      throw new Error("Ephemeral address not defined in the state. This is a bug.");
    }

    if (!moonbeamEphemeralAddress && !brlaEvmAddress) {
      throw new Error(
        "Moonbeam ephemeral address and BRL EVM address not defined in the state. One of them should be defined. This is a bug."
      );
    }

    const didTokensLeavePendulum = async () => {
      // Token is always either axlUSDC or BRL.
      const currencyId =
        state.type === "off"
          ? getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).pendulumRepresentative.currencyId
          : PENDULUM_USDC_AXL.currencyId;
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumEphemeralAddress, currencyId);

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      return currentBalance.lt(outputAmountBeforeFinalStep.raw);
    };

    const didTokensArriveOnMoonbeam = async () => {
      // Token is always either axlUSDC or BRL.
      const tokenAddress =
        state.type === "off" ? getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).moonbeamErc20Address : AXL_USDC_MOONBEAM;
      const ownerAddress =
        state.type === "off" && state.state.outputTokenType === FiatToken.BRL ? brlaEvmAddress : moonbeamEphemeralAddress;

      const balance = await getEvmTokenBalance({
        chain: moonbeam,
        ownerAddress: ownerAddress as `0x${string}`,
        tokenAddress: tokenAddress as `0x${string}`
      });

      return balance.gte(Big(outputAmountBeforeFinalStep.raw));
    };

    try {
      // We have to check if the input token already arrived on Moonbeam and if it left Pendulum.
      // If we'd only check if it arrived on Moonbeam, we might miss transferring them if the target account already has some tokens.
      if ((await didTokensLeavePendulum()) && (await didTokensArriveOnMoonbeam())) {
        logger.info(
          `PendulumToMoonbeamPhaseHandler: Input token already arrived on Moonbeam, skipping XCM transfer for ramp ${state.id}.`
        );
        return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
      }

      const { txData: pendulumToMoonbeamTransaction } = this.getPresignedTransaction(state, "pendulumToMoonbeam");

      if (typeof pendulumToMoonbeamTransaction !== "string") {
        throw new Error("PendulumToMoonbeamPhaseHandler: Invalid transaction data. This is a bug.");
      }

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToMoonbeamTransaction, pendulumNode.api);
      logger.info(`PendulumToMoonbeamPhaseHandler: Submitting XCM transfer to Moonbeam for ramp ${state.id}`);
      const { hash } = await submitXTokens(
        getAddressForFormat(pendulumEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic
      );

      logger.info(
        `PendulumToMoonbeamPhaseHandler: XCM transfer submitted with hash ${hash} for ramp ${state.id}. Waiting for the token to arrive on Moonbeam...`
      );
      await didTokensArriveOnMoonbeam();

      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
    } catch (e) {
      console.error("Error in PendulumToMoonbeamPhase:", e);
      throw e;
    }
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    if (state.type === "off") {
      return "brlaPayoutOnMoonbeam";
    } else {
      return "squidRouterSwap";
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
