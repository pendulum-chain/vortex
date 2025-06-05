import { RampPhase, decodeSubmittableExtrinsic, getAddressForFormat } from '@packages/shared';
import RampState from '../../../../models/rampState.model';
import { BasePhaseHandler } from '../base-phase-handler';

import { submitXTokens } from '../../xcm/send';

import { ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';

export class PendulumToAssethubXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'pendulumToAssethub';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const { pendulumEphemeralAddress } = state.state as StateMetadata;

    if (!pendulumEphemeralAddress) {
      throw new Error('Pendulum ephemeral address is not defined in the state. This is a bug.');
    }

    try {
      const { txData: pendulumToAssethubTransaction } = this.getPresignedTransaction(state, 'pendulumToAssethub');

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToAssethubTransaction as string, pendulumNode.api);
      const { hash } = await submitXTokens(
        getAddressForFormat(pendulumEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic,
      );

      state.state = {
        ...state.state,
        pendulumToAssethubXcmHash: hash,
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, 'complete');
    } catch (e) {
      console.error('Error in PendulumToAssethubPhase:', e);
      throw e;
    }
  }
}

export default new PendulumToAssethubXCMPhaseHandler();
