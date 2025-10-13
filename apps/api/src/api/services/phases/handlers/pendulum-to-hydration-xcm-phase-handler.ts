import { ApiManager, decodeSubmittableExtrinsic, getAddressForFormat, RampPhase, submitXTokens } from "@packages/shared";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class PendulumToHydrationXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToHydrationXcm";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const { substrateEphemeralAddress } = state.state as StateMetadata;

    if (!substrateEphemeralAddress) {
      throw new Error("Pendulum ephemeral address is not defined in the state. This is a bug.");
    }

    try {
      const { txData: pendulumToHydrationTransaction } = this.getPresignedTransaction(state, "pendulumToHydrationXcm");

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToHydrationTransaction as string, pendulumNode.api);
      const { hash } = await submitXTokens(
        getAddressForFormat(substrateEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic
      );

      state.state = {
        ...state.state,
        pendulumToHydrationXcmHash: hash
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, "hydrationSwap");
    } catch (e) {
      console.error("Error in pendulumToHydrationXcm phase:", e);
      throw e;
    }
  }
}

export default new PendulumToHydrationXCMPhaseHandler();
