import { HORIZON_URL, RampPhase } from 'shared';
import { Horizon, Networks, Transaction } from 'stellar-sdk';

import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

const NETWORK_PASSPHRASE = Networks.PUBLIC;
const horizonServer = new Horizon.Server(HORIZON_URL);

export class SpacewalkRedeemPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'stellarCleanup';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    try {
      const { tx_data: stellarCleanupTransactionXDR } = this.getPresignedTransaction(state, 'stellarCleanup');

      const stellarCleanupTransactionTransaction = new Transaction(stellarCleanupTransactionXDR, NETWORK_PASSPHRASE);
      await horizonServer.submitTransaction(stellarCleanupTransactionTransaction);

      return this.transitionToNextPhase(state, 'complete');
    } catch (e) {
      const horizonError = e as { response: { data: { extras: any } } };
      console.log(
        `Could not submit the cleanup transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
      );

      if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
        console.log('Recovery mode: Cleanup already performed.');
        return this.transitionToNextPhase(state, 'complete');
      } else {
        console.error(horizonError.response.data.extras);
        throw new Error('Could not submit the cleanup transaction');
      }
    }
  }
}

export default new SpacewalkRedeemPhaseHandler();
