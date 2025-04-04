import { HORIZON_URL, RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { Transaction } from 'stellar-sdk';
import { Horizon, NetworkError, Networks } from 'stellar-sdk';

export const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;
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

    //Only stellar case requires an initial operation, sending the create ephemeral transaction
    if (state.state.stellarTarget) {
      try {
        const { tx_data: stellarCreationTransactionXDR } = this.getPresignedTransaction(state, 'stellarCreateAccount');

        const stellarCreationTransaction = new Transaction(stellarCreationTransactionXDR, NETWORK_PASSPHRASE);
        await horizonServer.submitTransaction(stellarCreationTransaction);

        return this.transitionToNextPhase(state, 'complete');
      } catch (e) {
        const horizonError = e as { response: { data: { extras: any } } };
        console.log(
          `Could not submit the stellar account creation transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
        );

        if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
          console.log('Recovery mode: Creation already performed.');

          return this.transitionToNextPhase(state, 'fundEphemeral');
        } else {
          console.error(horizonError.response.data.extras);
          throw new Error('Could not submit the stellar creation transaction');
        }
      }
    }

    return this.transitionToNextPhase(state, 'fundEphemeral');
  }
}

export default new InitialPhaseHandler();
