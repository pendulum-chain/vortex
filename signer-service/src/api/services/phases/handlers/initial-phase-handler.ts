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
  public getPhaseName(): string {
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
    return this.transitionToNextPhase(state, 'prepareTransactions');
  }
}

export default new InitialPhaseHandler();
