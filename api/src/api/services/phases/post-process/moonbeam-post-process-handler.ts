import { CleanupPhase, Networks, PresignedTx, RampPhase, decodeSubmittableExtrinsic } from 'shared';
import { BasePostProcessHandler } from './base-post-process-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { ApiManager } from '../../pendulum/apiManager';
import { submitExtrinsic } from '@pendulum-chain/api-solang';

/**
 * Post process handler for Moonbeam cleanup operations
 */
export class MoonbeamPostProcessHandler extends BasePostProcessHandler {

  public getCleanupName(): CleanupPhase {
      return 'moonbeamCleanup';
    }
  
  /**
   * Check if this handler should process the given state
   */
  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== 'complete') {
      return false;
    }

    // Moonbeam cleanup is only required for BRL onramp
    if (state.type !== 'on') {
      return false;
    }

    return true;
  }

  /**
   * Process the Moonbeam cleanup for the given state
   * @returns A tuple with [success, error] where success is true if the process completed successfully,
   * and error is null if successful or an Error if it failed
   */
  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'moonbeam';
    const moonbeamNode = await apiManager.getApi(networkName);

    try {
      const { txData: moonbeamCleanupTransaction } = this.getPresignedTransaction(state, 'moonbeamCleanup');

      const approvalExtrinsic = decodeSubmittableExtrinsic(moonbeamCleanupTransaction as string, moonbeamNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === 'error') {
        return [false, this.createErrorObject(`Moonbeam cleanup failed: ${result.status.error.toString()}`)];
      }
      
      logger.info(`Successfully processed Moonbeam cleanup for ramp state ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Moonbeam cleanup failed: ${e}`)];
    }
  }
}

export default new MoonbeamPostProcessHandler();
