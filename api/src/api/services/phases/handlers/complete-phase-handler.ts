import { RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';

/**
 * Placeholder phase to perform any final actions after the ramp flow is complete.
 */
export class CompletePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'complete';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing final steps for ramp ${state.id}`);

    return state;
  }
}

export default new CompletePhaseHandler();
