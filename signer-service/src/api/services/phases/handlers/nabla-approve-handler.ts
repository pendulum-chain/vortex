import { ExecuteMessageResult, submitExtrinsic } from '@pendulum-chain/api-solang';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { decodeSubmittableExtrinsic } from '../../transactions';

import { ApiManager } from '../../pendulum/apiManager';

export class NablaApprovePhaseHandler extends BasePhaseHandler {
  public getPhaseName(): string {
    return 'nablaApprove';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    // TODO we previously had a nonce check here, I think we could make it mor robust by checking the expected output.
    // furthermore this won't be optimal if we have multiple pre-signed transactions.

    // const ephemeralAccountNonce = await getEphemeralNonce(state, context);
    // if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > nablaApproveNonce) {
    //     return successorState;
    // }

    try {
      const nablaApproveTransaction = this.getPresignedTransaction(state, 'nablaApprove');

      const approvalExtrinsic = decodeSubmittableExtrinsic(nablaApproveTransaction, pendulumNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === 'error') {
        console.log(`Could not approve token: ${result.status.error.toString()}`);
        throw new Error('Could not approve token');
      }

      return this.transitionToNextPhase(state, 'nablaSwap');
    } catch (e) {
      let errorMessage = '';
      const {result} = e as ExecuteMessageResult;
      if (result?.type === 'reverted') {
        errorMessage = result.description;
      } else if (result?.type === 'error') {
        errorMessage = result.error;
      } else {
        errorMessage = 'Something went wrong';
      }
      console.log(`Could not approve the required amount of token: ${errorMessage}`);

      throw e;
    }
  }
}

export default new NablaApprovePhaseHandler();
