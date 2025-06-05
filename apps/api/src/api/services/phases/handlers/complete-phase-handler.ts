import { RampPhase } from 'shared';
import logger from '../../../../config/logger';
import RampState from '../../../../models/rampState.model';
import { getStatus } from '../../transactions/squidrouter/route';
import { BasePhaseHandler } from '../base-phase-handler';

/**
 * Placeholder phase to perform any final actions after the ramp flow is complete.
 */
export class CompletePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'complete';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing final steps for ramp ${state.id}`);

    // Call into the squidrouter status endpoint to get the final status of the transaction
    // We don't need to wait nor handle the result. It's for them to track our transaction.
    if (state.state.squidRouterSwapHash) {
      getStatus(state.state.squidRouterSwapHash).catch((error) =>
        logger.error('Error getting status of squidrouter transaction', error),
      );
    }

    return state;
  }
}

export default new CompletePhaseHandler();
