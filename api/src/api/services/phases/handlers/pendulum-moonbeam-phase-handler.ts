import { AXL_USDC_MOONBEAM, FiatToken, RampPhase, decodeSubmittableExtrinsic, getAddressForFormat, getAnyFiatTokenDetailsMoonbeam } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { submitXTokens } from '../../xcm/send';
import { moonbeam } from 'viem/chains';
import { ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';
import { getEvmTokenBalance } from '../../moonbeam/balance';
import Big from 'big.js';


export class PendulumToMoonbeamXCMPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'pendulumToMoonbeam';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi('pendulum');

    const { pendulumEphemeralAddress, moonbeamEphemeralAddress, outputAmountBeforeFinalStep, outputTokenType } = state.state as StateMetadata;

    if (!pendulumEphemeralAddress || !moonbeamEphemeralAddress) {
      throw new Error('Ephemeral address(es) not defined in the state. This is a bug.');
    }

    const didInputTokenArrivedOnMoonbeam = async () => {
      // Token is always either axlUSDC or BRL.
      const tokenAddress = state.type === 'off' ? getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).moonbeamErc20Address : AXL_USDC_MOONBEAM;
      const balance = await getEvmTokenBalance({
        tokenAddress: tokenAddress as `0x${string}`,
        ownerAddress: moonbeamEphemeralAddress as `0x${string}`,
        chain: moonbeam,
      });

      return balance.gte(Big(outputAmountBeforeFinalStep.raw));
    };

    try {
      if (await didInputTokenArrivedOnMoonbeam()) {
          return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
      }

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
      return 'squidRouterSwap';
    }
  }
}

export default new PendulumToMoonbeamXCMPhaseHandler();
