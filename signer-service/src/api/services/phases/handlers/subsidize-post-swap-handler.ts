import { BasePhaseHandler } from '../base-phase-handler';
import { FiatToken, RampPhase } from 'shared';
import RampState from '../../../../models/rampState.model';
import Big from 'big.js';
import { StateMetadata } from '../meta-state-types';
import { ApiManager } from '../../pendulum/apiManager';
import { getFundingAccount } from '../../../controllers/subsidize.controller';

export class SubsidizePostSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'subsidizePostSwap';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const { pendulumEphemeralAddress, outputTokenPendulumDetails, outputAmountBeforeFees, outputTokenType } =
      state.state as StateMetadata;

    if (!pendulumEphemeralAddress || !outputTokenPendulumDetails || !outputAmountBeforeFees || !outputTokenType) {
      throw new Error('SubsidizePostSwapPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        pendulumEphemeralAddress,
        outputTokenPendulumDetails.pendulumCurrencyId,
      );

      const currentBalance = Big(balanceResponse?.free?.toString() ?? '0');
      if (currentBalance.eq(Big(0))) {
        throw new Error('Invalid phase: input token did not arrive yet on pendulum');
      }

      const requiredAmount = Big(outputAmountBeforeFees.raw).sub(currentBalance);
      if (requiredAmount.gt(Big(0))) {
        // Do the actual subsidizing.
        console.log('Subsidizing post-swap with', requiredAmount.toString());
        const fundingAccountKeypair = getFundingAccount();
        await pendulumNode.api.tx.tokens
          .transfer(
            pendulumEphemeralAddress,
            outputTokenPendulumDetails.pendulumCurrencyId,
            requiredAmount.toFixed(0, 0),
          )
          .signAndSend(fundingAccountKeypair);
      }

      if (outputTokenType === FiatToken.BRL) {
        return this.transitionToNextPhase(state, 'pendulumToMoonbeam');
      } else {
        return this.transitionToNextPhase(state, 'spacewalkRedeem');
      }
    } catch (e) {
      console.error('Error in subsidizePostSwap:', e);
      throw new Error('SubsidizePostSwapPhaseHandler: Failed to subsidize post swap.');
    }
  }
}

export default new SubsidizePostSwapPhaseHandler();
