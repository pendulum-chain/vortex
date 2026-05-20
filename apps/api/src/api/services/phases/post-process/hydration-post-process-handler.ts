import { submitExtrinsic } from "@pendulum-chain/api-solang";
import { ApiManager, CleanupPhase, decodeSubmittableExtrinsic, RampDirection } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePostProcessHandler } from "./base-post-process-handler";

export class HydrationPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "hydrationCleanup";
  }

  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    if (state.type !== RampDirection.BUY) {
      return false;
    }

    const presignedTx = this.getPresignedTransaction(state, "hydrationCleanup");
    return presignedTx !== undefined;
  }

  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const apiManager = ApiManager.getInstance();
    const hydrationNode = await apiManager.getApi("hydration");

    try {
      const { txData: hydrationCleanupTransaction } = this.getPresignedTransaction(state, "hydrationCleanup");

      const cleanupExtrinsic = decodeSubmittableExtrinsic(hydrationCleanupTransaction as string, hydrationNode.api);
      const result = await submitExtrinsic(cleanupExtrinsic);

      if (result.status.type === "error") {
        return [false, this.createErrorObject(`Could not perform hydration cleanup: ${result.status.error.toString()}`)];
      }

      logger.info(`Successfully processed Hydration cleanup for ramp state ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in Hydration cleanup: ${e}`)];
    }
  }
}

export default new HydrationPostProcessHandler();
