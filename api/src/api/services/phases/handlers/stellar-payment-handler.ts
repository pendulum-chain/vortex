import { HORIZON_URL, RampPhase } from 'shared';
import { Horizon, NetworkError, Networks, Transaction } from 'stellar-sdk';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

const NETWORK_PASSPHRASE = Networks.PUBLIC;
const horizonServer = new Horizon.Server(HORIZON_URL);

export class StellarPaymentPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'stellarPayment';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { txData: offrampingTransactionXDR } = this.getPresignedTransaction(state, 'stellarPayment');
    if (typeof offrampingTransactionXDR !== 'string') {
      throw new Error('Invalid transaction data');
    }

    try {
      const offrampingTransaction = new Transaction(offrampingTransactionXDR, NETWORK_PASSPHRASE);
      await horizonServer.submitTransaction(offrampingTransaction);

      return this.transitionToNextPhase(state, 'complete');
    } catch (e) {
      const horizonError = e as NetworkError;

      if (horizonError.response.data?.status === 400) {
        console.log(
          `Could not submit the offramp transaction ${JSON.stringify(horizonError.response.data.extras.result_codes)}`,
        );
        // check https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions
        if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
          console.log('Assuming offramp was already performed.');
          return this.transitionToNextPhase(state, 'complete');
        }

        console.error(horizonError.response.data.extras);
        throw new Error('Could not submit the offramping transaction');
      } else {
        console.error('Error while submitting the offramp transaction', e);
        throw new Error('Could not submit the offramping transaction');
      }
    }
  }
}

export default new StellarPaymentPhaseHandler();
