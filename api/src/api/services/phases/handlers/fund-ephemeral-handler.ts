import { FiatToken, getNetworkFromDestination, RampPhase } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import { API, ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';
import { fundEphemeralAccount } from '../../pendulum/pendulum.service';
import Big from 'big.js';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { GLMR_FUNDING_AMOUNT_RAW, PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../../constants/constants';
import { fundMoonbeamEphemeralAccount } from '../../moonbeam/balance';
import logger from '../../../../config/logger';

export class FundEphemeralPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'fundEphemeral';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi('pendulum');
    const moonebamNode = await apiManager.getApi('moonbeam');

    const { moonbeamEphemeralAddress, pendulumEphemeralAddress } = state.state as StateMetadata;

    if (!pendulumEphemeralAddress) {
      throw new Error('FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.');
    }
    if (state.type === 'on' && !moonbeamEphemeralAddress) {
      throw new Error('FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const isPendulumFunded = await isPendulumEphemeralFunded(pendulumEphemeralAddress, pendulumNode);

      let isMoonbeamFunded = true;
      if (state.type === 'on' && moonbeamEphemeralAddress) {
        isMoonbeamFunded = await isMoonbeamEphemeralFunded(moonbeamEphemeralAddress, moonebamNode);
      }

      if (!isPendulumFunded) {
        logger.info('Funding pen ephemeral...');
        if (state.type === 'on' && state.to !== 'assethub') {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, true);
        } else if (state.state.outputCurrency === FiatToken.BRL) {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, true);
        } else {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, false);
        }
      } else {
        logger.info('Pendulum ephemeral address already funded.');
      }

      if (state.type === 'on' && !isMoonbeamFunded) {
        logger.info('Funding moonbeam ephemeral...');

        const destinationNetwork = getNetworkFromDestination(state.to);
        // For onramp case, "to" is always a network.
        if (!destinationNetwork) {
          throw new Error('FundEphemeralPhaseHandler: Invalid destination network.');
        }

        await fundMoonbeamEphemeralAccount(moonbeamEphemeralAddress, destinationNetwork);
      }
    } catch (e) {
      console.error('Error in FundEphemeralPhaseHandler:', e);
      const recoverableError = this.createRecoverableError('Error funding ephemeral account');
      throw recoverableError;
    }

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // onramp case
    if (state.type === 'on') {
      return 'moonbeamToPendulumXcm';
    }

    // off ramp cases
    if (state.type === 'off' && state.from === 'assethub') {
      return 'distributeFees';
    } else {
      return 'moonbeamToPendulum'; // Via contract.subsidizePreSwap
    }
  }
}

async function isPendulumEphemeralFunded(pendulumEphemeralAddress: string, pendulumNode: API): Promise<boolean> {
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();
  const { data: balance } = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);

  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

async function isMoonbeamEphemeralFunded(moonbeamEphemeralAddress: string, moonebamNode: API): Promise<boolean> {
  const { data: balance } = await moonebamNode.api.query.system.account(moonbeamEphemeralAddress);
  return Big(balance.free.toString()).gte(GLMR_FUNDING_AMOUNT_RAW);
}

export default new FundEphemeralPhaseHandler();
