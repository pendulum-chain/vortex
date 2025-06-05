import { CleanupPhase, FiatToken, HORIZON_URL } from '@packages/shared';
import { Horizon, NetworkError, Networks as StellarNetworks, Transaction } from 'stellar-sdk';
import logger from '../../../../config/logger';
import { SEQUENCE_TIME_WINDOW_IN_SECONDS } from '../../../../constants/constants';
import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { BasePostProcessHandler } from './base-post-process-handler';

const NETWORK_PASSPHRASE = StellarNetworks.PUBLIC;
const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Post process handler for Stellar cleanup operations
 */
export class StellarPostProcessHandler extends BasePostProcessHandler {
  /**
   * Check if this handler should process the given state
   */
  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== 'complete') {
      return false;
    }

    if (state.type !== 'off' || (state.state as StateMetadata).outputTokenType === FiatToken.BRL) {
      return false;
    }

    return true;
  }

  /**
   * Get the name of the cleanup handler
   */
  public getCleanupName(): CleanupPhase {
    return 'stellarCleanup';
  }

  /**
   * Process the Stellar cleanup for the given state
   * @returns A tuple with [success, error] where success is true if the process completed successfully,
   * and error is null if successful or an Error if it failed
   */
  public async process(state: RampState): Promise<[boolean, Error | null]> {
    try {
      const expectedLedgerTimeMs = state.createdAt.getTime() + SEQUENCE_TIME_WINDOW_IN_SECONDS * 1.1 * 1000; // Add some safety margin in case ledger producton was slower.
      if (expectedLedgerTimeMs > Date.now()) {
        return [false, this.createErrorObject(`Stellar cleanup for ramp state ${state.id} cannot be processed yet.`)];
      }
      const { txData: stellarCleanupTransactionXDR } = this.getPresignedTransaction(state, 'stellarCleanup');

      const stellarCleanupTransactionTransaction = new Transaction(
        stellarCleanupTransactionXDR as string,
        NETWORK_PASSPHRASE,
      );
      await horizonServer.submitTransaction(stellarCleanupTransactionTransaction);

      logger.info(`Successfully processed Stellar cleanup for ramp state ${state.id}`);
      return [true, null];
    } catch (e) {
      try {
        const horizonError = e as NetworkError;
        if (horizonError.response.data?.status === 400) {
          logger.info(
            `Could not submit the cleanup transaction ${JSON.stringify(
              horizonError.response?.data?.extras.result_codes,
            )}`,
          );

          if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
            logger.info('Recovery mode: Cleanup already performed.');
            return [true, null];
          }

          logger.error(horizonError.response.data.extras);
          return [false, this.createErrorObject('Could not submit the cleanup transaction')];
        }

        logger.error('Error while submitting the cleanup transaction', e);
        return [false, this.createErrorObject('Could not submit the cleanup transaction')];
      } catch (_parseError) {
        // If we can't parse the error as a Horizon error, it's a different type of error
        return [false, this.createErrorObject(e instanceof Error ? e : String(e))];
      }
    }
  }
}

export default new StellarPostProcessHandler();
