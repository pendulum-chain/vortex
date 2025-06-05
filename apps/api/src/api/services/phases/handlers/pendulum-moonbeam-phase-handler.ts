import { RampPhase, decodeSubmittableExtrinsic, getAddressForFormat } from '@packages/shared';
import RampState from '../../../../models/rampState.model';
import { BasePhaseHandler } from '../base-phase-handler';

import { submitXTokens } from '../../xcm/send';

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
      const { txData: pendulumToMoonbeamTransaction } = this.getPresignedTransaction(state, 'pendulumToMoonbeam');

      if (typeof pendulumToMoonbeamTransaction !== 'string') {
        throw new Error('PendulumToMoonbeamPhaseHandler: Invalid transaction data. This is a bug.');
      }

      const xcmExtrinsic = decodeSubmittableExtrinsic(pendulumToMoonbeamTransaction, pendulumNode.api);
      const { hash } = await submitXTokens(
        getAddressForFormat(pendulumEphemeralAddress, pendulumNode.ss58Format),
        xcmExtrinsic,
      );

      state.state = {
        ...state.state,
        pendulumToMoonbeamXcmHash: hash,
      };
      await state.update({ state: state.state });

      return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
    } catch (e) {
      console.error('Error in PendulumToMoonbeamPhase:', e);
      throw e;
    }
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    if (state.type === 'off') {
      return 'brlaPayoutOnMoonbeam';
    } else {
      return 'squidrouterSwap';
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
