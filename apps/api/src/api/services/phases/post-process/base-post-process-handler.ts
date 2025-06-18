import { CleanupPhase, PresignedTx } from "@packages/shared";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";

/**
 * Base class for post-process handlers that handle cleanup operations
 * after a ramp transaction has completed.
 */
export abstract class BasePostProcessHandler {
  /**
   * Check if this handler should process the given state
   */
  public abstract shouldProcess(state: RampState): boolean;

  /**
   * Process the given state
   * @returns A tuple with [success, error] where success is true if the process completed successfully,
   * and error is null if successful or an Error if it failed
   */
  public abstract process(state: RampState): Promise<[boolean, Error | null]>;

  /**
   * Get the name of the cleanup handler
   */
  public abstract getCleanupName(): CleanupPhase;

  /**
   * Create an error object for a failed cleanup
   *
   * @param error The error that occurred
   * @returns The formatted error object
   */
  protected createErrorObject(error: Error | string): Error {
    const errorMessage = error instanceof Error ? error.message : error;
    const handlerName = this.getCleanupName();

    logger.error(`Cleanup phase '${handlerName}' failed: ${errorMessage}`);

    return new Error(`Cleanup phase '${handlerName}' failed: ${errorMessage}`);
  }

  /**
   * Get a presigned transaction for a specific cleanup phase
   * @param state The ramp state
   * @param phase The cleanup phase to get the transaction for
   * @returns The presigned transaction
   */
  protected getPresignedTransaction(state: RampState, phase: CleanupPhase): PresignedTx {
    return state.presignedTxs?.find(tx => tx.phase === phase) as PresignedTx;
  }
}
