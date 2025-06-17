import { CleanupPhase, FiatToken, Networks, PresignedTx, RampPhase, decodeSubmittableExtrinsic } from "@packages/shared";
import { submitExtrinsic } from "@pendulum-chain/api-solang";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { ApiManager } from "../../pendulum/apiManager";
import { StateMetadata } from "../meta-state-types";
import { BasePostProcessHandler } from "./base-post-process-handler";

/**
 * Post process handler for Pendulum cleanup operations
 */
export class PendulumPostProcessHandler extends BasePostProcessHandler {
  /**
   * Check if this handler should process the given state
   */
  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    return true;
  }

  /**
   * Get the name of the cleanup handler
   */
  public getCleanupName(): CleanupPhase {
    return "pendulumCleanup";
  }

  /**
   * Process the Pendulum cleanup for the given state
   * @returns A tuple with [success, error] where success is true if the process completed successfully,
   * and error is null if successful or an Error if it failed
   */
  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const apiManager = ApiManager.getInstance();
    const networkName = "pendulum";
    const pendulumNode = await apiManager.getApi(networkName);

    const { outputTokenType } = state.state as StateMetadata;

    if (!outputTokenType) {
      return [false, this.createErrorObject("Output token type is not defined in the state. This is a bug.")];
    }

    try {
      const { txData: pendulumCleanupTransaction } = this.getPresignedTransaction(state, "pendulumCleanup");

      const approvalExtrinsic = decodeSubmittableExtrinsic(pendulumCleanupTransaction as string, pendulumNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === "error") {
        return [false, this.createErrorObject(`Could not perform pendulum cleanup: ${result.status.error.toString()}`)];
      }

      logger.info(`Successfully processed Pendulum cleanup for ramp state ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in PendulumCleanupPhase: ${e}`)];
    }
  }
}

export default new PendulumPostProcessHandler();
