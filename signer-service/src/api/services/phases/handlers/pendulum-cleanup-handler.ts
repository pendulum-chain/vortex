import { FiatToken, RampPhase, decodeSubmittableExtrinsic } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';


import { ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';
import { submitExtrinsic } from '@pendulum-chain/api-solang';

export class PendulumCleanupPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'pendulumCleanup';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const { outputTokenType } = state.state as StateMetadata;

    if (!outputTokenType) {
      throw new Error('PendulumCleanupPhaseHandler: Output token type is not defined in the state. This is a bug.');
    }

    let nextPhase: RampPhase;
    if (outputTokenType === FiatToken.BRL) {
      nextPhase = 'complete';
    } else {
      nextPhase = 'stellarPayment';
    }
    try {
      const pendulumCleanupTransaction = this.getPresignedTransaction(state, 'pendulumCleanup');

      const approvalExtrinsic = decodeSubmittableExtrinsic(pendulumCleanupTransaction, pendulumNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === 'error') {
        console.log(`Could not perform pendulum cleanup: ${result.status.error.toString()}`);
        // we don't want to fail the whole process if this fails
      }
    } catch (e) {
      console.error('Error in PendulumCleanupPhase:', e);
    }

    return this.transitionToNextPhase(state, nextPhase);
  }
}

export default new PendulumCleanupPhaseHandler();
