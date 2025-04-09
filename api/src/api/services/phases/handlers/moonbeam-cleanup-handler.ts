import { RampPhase, decodeSubmittableExtrinsic } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { ApiManager } from '../../pendulum/apiManager';
import { submitExtrinsic } from '@pendulum-chain/api-solang';

export class MoonbeamCleanupPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'moonbeamCleanup';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'moonbeam';
    const moonbeamNode = await apiManager.getApi(networkName);

    if (state.type !== 'on') {
      throw new Error(
        'MoonbeamCleanupPhaseHandler: Invalid transition, moonbeam cleanup is only required for BRL onramp.',
      );
    }
    try {
      const { txData: moonbeamCleanupTransaction } = this.getPresignedTransaction(state, 'moonbeamCleanup');

      const approvalExtrinsic = decodeSubmittableExtrinsic(moonbeamCleanupTransaction as string, moonbeamNode.api);
      const result = await submitExtrinsic(approvalExtrinsic);

      if (result.status.type === 'error') {
        console.log(`Could not perform moonbeam cleanup: ${result.status.error.toString()}`);
        // we don't want to fail the whole process if this fails
      }
    } catch (e) {
      console.error('Error in MoonbeamCleanupPhase:', e);
    }

    return this.transitionToNextPhase(state, 'complete');
  }
}

export default new MoonbeamCleanupPhaseHandler();
