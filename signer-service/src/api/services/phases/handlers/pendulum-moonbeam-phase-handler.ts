import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { submitXTokens } from '../../../services/xcm/send';
import { decodeSubmittableExtrinsic } from '../../transactions';

import { ApiManager } from '../../pendulum/apiManager';

export class PendulumToMoonbeamXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): string {
    return 'executePendulumToMoonbeamXCM';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const { pendulumEphemeralAddress } = state.state;

    if (!pendulumEphemeralAddress) {
      throw new Error('Pendulum ephemeral address is not defined in the state. This is a bug.');
    }

    try {
      const pendulumToMoonbeamTransaction = this.getPresignedTransaction(state, 'pendulumToMoonbeam');

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToMoonbeamTransaction, pendulumNode.api);
      const { hash } = await submitXTokens(pendulumEphemeralAddress, xcmExtrinsic);

      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash,
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, 'performBrlaPayoutOnMoonbeam');
    } catch (e) {
      console.error('Error in PendulumToMoonbeamPhase:', e);
      throw e;
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
