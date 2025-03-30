import { RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';

/**
 * Handler for the initial phase
 */
export class InitialPhaseHandler extends BasePhaseHandler {
  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return 'initial';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing initial phase for ramp ${state.id}`);

    // The initial phase is just a placeholder
    // Transition to the prepareTransactions phase
    // FIXME use the correct next phase
    return this.transitionToNextPhase(state, 'fundEphemeral');
  }
}

export default new InitialPhaseHandler();
