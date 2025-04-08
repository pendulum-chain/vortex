import { BasePhaseHandler } from '../base-phase-handler';
import { FiatToken, RampPhase } from 'shared';
import RampState from '../../../../models/rampState.model';
import Big from 'big.js';
import { StateMetadata } from '../meta-state-types';
import { ApiManager } from '../../pendulum/apiManager';
import { getFundingAccount } from '../../../controllers/subsidize.controller';

export class SubsidizePreSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'subsidizePreSwap';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const { pendulumEphemeralAddress, inputTokenPendulumDetails, inputAmountBeforeSwapRaw, outputTokenType } =
      state.state as StateMetadata;

    if (!pendulumEphemeralAddress || !inputTokenPendulumDetails || !inputAmountBeforeSwapRaw || !outputTokenType) {
      throw new Error('SubsidizePreSwapPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        pendulumEphemeralAddress,
        inputTokenPendulumDetails.pendulumCurrencyId,
      );

      const currentBalance = Big(balanceResponse?.free?.toString() ?? '0');
      if (currentBalance.eq(Big(0))) {
        throw new Error('Invalid phase: input token did not arrive yet on pendulum');
      }

      const requiredAmount = Big(inputAmountBeforeSwapRaw).sub(currentBalance);
      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        console.log('Subsidizing pre-swap with', requiredAmount.toString());
        console.log(
          'Target value: ',
          inputAmountBeforeSwapRaw.toString(),
          'Current value: ',
          currentBalance.toString(),
        );
        const fundingAccountKeypair = getFundingAccount();
        // TODO this and other calls, add to executeApiCall to avoid low priority errors.
        await pendulumNode.api.tx.tokens
          .transfer(
            pendulumEphemeralAddress,
            inputTokenPendulumDetails.pendulumCurrencyId,
            requiredAmount.toFixed(0, 0),
          )
          .signAndSend(fundingAccountKeypair);
      }

      return this.transitionToNextPhase(state, 'nablaApprove');
    } catch (e) {
      console.error('Error in subsidizePreSwap:', e);
      throw new Error('SubsidizePreSwapPhaseHandler: Failed to subsidize post swap.');
    }
  }
}

export default new SubsidizePreSwapPhaseHandler();
