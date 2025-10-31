import { ApiManager, decodeSubmittableExtrinsic, RampPhase, submitExtrinsic } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class HydrationToAssethubXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "hydrationToAssethubXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "hydration";
    const hydrationNode = await apiManager.getApi(networkName);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!substrateEphemeralAddress) {
      throw new Error("Pendulum ephemeral address is not defined in the state. This is a bug.");
    }

    try {
      const { txData: hydrationToAssethub, nonce } = this.getPresignedTransaction(state, "hydrationToAssethubXcm");

      const accountData = await hydrationNode.api.query.system.account(substrateEphemeralAddress);
      const currentEphemeralAccountNonce = accountData.nonce.toNumber();
      if (currentEphemeralAccountNonce !== undefined && currentEphemeralAccountNonce > nonce) {
        logger.warn(
          `Nonce mismatch: Hydration Account ${substrateEphemeralAddress} has nonce ${currentEphemeralAccountNonce}, expected nonce for TX: ${nonce}`
        );
      }

      const xcmExtrinsic = decodeSubmittableExtrinsic(hydrationToAssethub as string, hydrationNode.api);
      // Don't wait for finalization because it somehow doesn't work on Hydration
      const { hash } = await submitExtrinsic(xcmExtrinsic, hydrationNode.api, false);

      state.state = {
        ...state.state,
        hydrationToAssethubXcmHash: hash
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, "complete");
    } catch (e) {
      console.error("Error in hydrationToAssethubXcm phase:", e);
      throw e;
    }
  }
}

export default new HydrationToAssethubXCMPhaseHandler();
