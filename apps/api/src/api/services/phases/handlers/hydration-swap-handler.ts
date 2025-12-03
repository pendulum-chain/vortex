import { ApiManager, decodeSubmittableExtrinsic, RampPhase, submitExtrinsic } from "@vortexfi/shared";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class HydrationSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "hydrationSwap";
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
      const { txData: hydrationSwap } = this.getPresignedTransaction(state, "hydrationSwap");

      const swapExtrinsic = decodeSubmittableExtrinsic(hydrationSwap as string, hydrationNode.api);
      const { hash } = await submitExtrinsic(swapExtrinsic, hydrationNode.api);

      state.state = {
        ...state.state,
        hydrationSwapHash: hash
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, "hydrationToAssethubXcm");
    } catch (e) {
      console.error("Error in hydrationSwap phase:", e);
      throw e;
    }
  }
}

export default new HydrationSwapPhaseHandler();
