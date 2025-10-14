import { ApiManager, decodeSubmittableExtrinsic, getAddressForFormat, RampPhase, submitXcm } from "@packages/shared";
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
      const { txData: hydrationToAssethub } = this.getPresignedTransaction(state, "pendulumToHydrationXcm");

      const xcmExtrinsic = decodeSubmittableExtrinsic(hydrationToAssethub as string, hydrationNode.api);
      const { hash } = await submitXcm(getAddressForFormat(substrateEphemeralAddress, hydrationNode.ss58Format), xcmExtrinsic);

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
