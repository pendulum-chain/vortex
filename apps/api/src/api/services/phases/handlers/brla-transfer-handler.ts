import { RampPhase } from "@packages/shared";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class BrlaTransferPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { inputAmount } = state.state as StateMetadata;

    if (!inputAmount) {
      throw new Error("BrlaTransferPhaseHandler: State metadata corrupted. This is a bug.");
    }

    logger.info({
      message: "BrlaTransferPhaseHandler: Starting BRLA transfer on Polygon.",
      rampId: state.id
    });

    // Placeholder for BRLA transfer logic
    // FIXME use the BRLA v2 api to do a transfer to the ephemeral account
    const sourceAddress = "0xSOURCE_ADDRESS_PLACEHOLDER";
    const destinationAddress = "0xDESTINATION_ADDRESS_PLACEHOLDER";
    const amountToTransfer = "100000000";

    logger.info({
      message: `Simulating transfer of ${amountToTransfer} BRLA from ${sourceAddress} to ${destinationAddress}`,
      rampId: state.id
    });

    logger.info({
      message: "BrlaTransferPhaseHandler: BRLA transfer successful.",
      rampId: state.id
    });

    return this.transitionToNextPhase(state, "fundEphemeral");
  }
}

export default new BrlaTransferPhaseHandler();
