import { HORIZON_URL, RampPhase } from 'shared';
import { Transaction, Horizon, NetworkError, Networks } from 'stellar-sdk';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';

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

    // Check if signed_transactions are present for offramps. If they are not, return early.
    if (state.type === 'off' && (state.presignedTxs === null || state.presignedTxs.length === 0)) {
      throw new Error('InitialPhaseHandler: No signed transactions found. Cannot proceed.');
    }

    // Only stellar case requires an initial operation, sending the create ephemeral transaction
    if (state.state.stellarTarget) {
      const { txData: stellarCreationTransactionXDR } = this.getPresignedTransaction(state, 'stellarCreateAccount');
      if (typeof stellarCreationTransactionXDR !== 'string') {
        throw new Error(
          'InitialPhaseHandler: `stellarCreateAccount` transaction is not a string -> not an encoded Stellar transaction.',
        );
      }

      try {
        const stellarCreationTransaction = new Transaction(stellarCreationTransactionXDR, NETWORK_PASSPHRASE);
        await horizonServer.submitTransaction(stellarCreationTransaction);

        return this.transitionToNextPhase(state, 'fundEphemeral');
      } catch (e) {
        const horizonError = e as NetworkError;
        if (horizonError.response.data?.status === 400) {
          logger.info(
            `Could not submit the stellar account creation transaction ${JSON.stringify(
              horizonError.response.data.extras.result_codes,
            )}`,
          );

          // TODO this error may need adjustment, as the `tx_bad_seq` may be due to parallel ramps and ephemeral creations.
          if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
            logger.info('Recovery mode: Creation already performed.');

            return this.transitionToNextPhase(state, 'fundEphemeral');
          }
          console.error(horizonError.response.data.extras);
          throw new Error('Could not submit the stellar creation transaction');
        } else {
          console.error(horizonError.response.data);
          throw new Error('Could not submit the stellar creation transaction');
        }
      }
    }

    return this.transitionToNextPhase(state, 'fundEphemeral');
  }
}

export default new InitialPhaseHandler();
