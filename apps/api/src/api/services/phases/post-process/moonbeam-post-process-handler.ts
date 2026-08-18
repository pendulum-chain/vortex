import { CleanupPhase, RampDirection } from "@vortexfi/shared";
import RampState from "../../../../models/rampState.model";
import { BasePostProcessHandler } from "./base-post-process-handler";

/**
 * Post process handler for Moonbeam cleanup operations
 */
export class MoonbeamPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "moonbeamCleanup";
  }

  /**
   * Check if this handler should process the given state
   */
  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    // Moonbeam cleanup is only required for BRL onramp
    if (state.type !== RampDirection.BUY) {
      return false;
    }

    return true;
  }

  /**
   * Process the Moonbeam cleanup for the given state
   * @returns A tuple with [success, error] where success is true if the process completed successfully,
   * and error is null if successful or an Error if it failed
   */
  public async process(_state: RampState): Promise<[boolean, Error | null]> {
    // Moonbeam is retired. Keep this tombstone handler successful so persisted
    // moonbeamCleanup errors are cleared without opening an RPC connection.
    return [true, null];
  }
}

export default new MoonbeamPostProcessHandler();
