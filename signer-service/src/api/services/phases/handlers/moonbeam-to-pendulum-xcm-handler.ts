import Big from 'big.js';
import { RampPhase, decodeSubmittableExtrinsic } from 'shared';

import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { ApiManager } from '../../pendulum/apiManager';
import { waitUntilTrue } from '../../../helpers/functions';
import { submitXcm } from '../../xcm/send';

export class MoonbeamToPendulumXcmPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'moonbeamToPendulumXcm';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const moonbeamNode = await apiManager.getApi('moonbeam');
    const pendulumNode = await apiManager.getApi('pendulum');

    const { pendulumEphemeralAddress, inputTokenPendulumDetails, moonbeamEphemeralAddress } =
      state.state as StateMetadata;

    if (!pendulumEphemeralAddress || !inputTokenPendulumDetails || !moonbeamEphemeralAddress) {
      throw new Error('MoonbeamToPendulumXcmPhaseHandler: State metadata corrupted. This is a bug.');
    }

    const didInputTokenArrivedOnPendulum = async () => {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        pendulumEphemeralAddress,
        inputTokenPendulumDetails.pendulumCurrencyId,
      );
      const currentBalance = Big(balanceResponse?.free?.toString() ?? '0');
      return currentBalance.gt(Big(0));
    };

    try {
      if (!(await didInputTokenArrivedOnPendulum())) {
        const moonbeamToPendulumXcmTransaction = this.getPresignedTransaction(state, 'moonbeamToPendulumXcm');

        const approvalExtrinsic = decodeSubmittableExtrinsic(moonbeamToPendulumXcmTransaction, moonbeamNode.api);

        // TODO verify this works on Moonbeam also.
        const { hash } = await submitXcm(moonbeamEphemeralAddress, approvalExtrinsic);
      }
    } catch (e) {
      console.error('Error while executing moonbeam-to-pendulum xcm:', e);
      throw new Error('MoonbeamToPendulumXcmPhaseHandler: Failed to send XCM transaction');
    }

    try {
      await waitUntilTrue(didInputTokenArrivedOnPendulum, 5000);
    } catch (e) {
      console.error('Error while waiting for transaction receipt:', e);
      throw new Error('MoonbeamToPendulumXcmPhaseHandler: Failed to wait for tokens to arrive on Pendulum.');
    }

    return this.transitionToNextPhase(state, 'subsidizePreSwap');
  }
}

export default new MoonbeamToPendulumXcmPhaseHandler();
