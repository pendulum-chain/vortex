import { HORIZON_URL, RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { Transaction } from 'stellar-sdk';
import { Horizon, NetworkError, Networks } from 'stellar-sdk';

export const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;
/**
 * Placeholder phase to perform any final actions after the ramp flow is complete.
 */
export class InitialPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'complete';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing final steps for ramp ${state.id}`);

    return state;
  }
}

export default new InitialPhaseHandler();
