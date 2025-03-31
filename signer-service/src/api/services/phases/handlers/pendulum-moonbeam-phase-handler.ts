import { RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { submitXTokens } from '../../xcm/send';
import { decodeSubmittableExtrinsic } from '../../transactions';

import { ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';

export class PendulumToMoonbeamXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'pendulumToMoonbeam';
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
      const pendulumToMoonbeamTransaction = this.getPresignedTransaction(state, 'pendulumToMoonbeam');

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToMoonbeamTransaction, pendulumNode.api);
      const { hash } = await submitXTokens(pendulumEphemeralAddress, xcmExtrinsic);

      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash,
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, 'brlaPayoutOnMoonbeam');
    } catch (e) {
      console.error('Error in PendulumToMoonbeamPhase:', e);
      throw e;
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
