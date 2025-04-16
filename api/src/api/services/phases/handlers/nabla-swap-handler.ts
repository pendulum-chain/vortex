import { ExecuteMessageResult, readMessage, submitExtrinsic } from '@pendulum-chain/api-solang';
import Big from 'big.js';
import { NABLA_ROUTER, PendulumDetails, RampPhase, decodeSubmittableExtrinsic } from 'shared';
import { Abi } from '@polkadot/api-contract';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { ApiManager } from '../../pendulum/apiManager';
import { routerAbi } from '../../../../contracts/Router';
import { defaultReadLimits } from '../../../helpers/contracts';
import { StateMetadata } from '../meta-state-types';
import logger from '../../../../config/logger';

export class NablaSwapPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'nablaSwap';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const {
      nablaSoftMinimumOutputRaw,
      pendulumEphemeralAddress,
      inputAmountBeforeSwapRaw,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
    } = state.state as StateMetadata;

    if (
      !nablaSoftMinimumOutputRaw ||
      !pendulumEphemeralAddress ||
      !inputAmountBeforeSwapRaw ||
      !inputTokenPendulumDetails ||
      !outputTokenPendulumDetails
    ) {
      throw new Error('State metadata is corrupt, missing values. This is a bug.');
    }

    try {
      const { txData: nablaSwapTransaction } = this.getPresignedTransaction(state, 'nablaSwap');

      logger.info('before RESPONSE prepareNablaSwapTransaction');
      // get an up to date quote for the AMM
      const response = await readMessage({
        abi: new Abi(routerAbi),
        api: pendulumNode.api,
        contractDeploymentAddress: NABLA_ROUTER,
        callerAddress: pendulumEphemeralAddress,
        messageName: 'getAmountOut',
        messageArguments: [
          inputAmountBeforeSwapRaw,
          [
            inputTokenPendulumDetails.pendulumErc20WrapperAddress,
            outputTokenPendulumDetails.pendulumErc20WrapperAddress,
          ],
        ],
        limits: defaultReadLimits,
      });
      if (response.type !== 'success') {
        throw new Error("Couldn't get a quote from the AMM");
      }

      const ouputAmountQuoteRaw = Big(response.value[0].toString());
      if (ouputAmountQuoteRaw.lt(Big(nablaSoftMinimumOutputRaw))) {
        logger.info(
          `The estimated output amount is too low to swap. Expected: ${nablaSoftMinimumOutputRaw}, got: ${ouputAmountQuoteRaw}`,
        );
        throw new Error("Won't execute the swap now. The estimated output amount is too low.");
      }

      const swapExtrinsic = decodeSubmittableExtrinsic(nablaSwapTransaction, pendulumNode.api);
      const result = await submitExtrinsic(swapExtrinsic);

      if (result.status.type === 'error') {
        logger.error(`Could not swap token: ${result.status.error.toString()}`);
        throw new Error('Could not swap token');
      }
    } catch (e) {
      let errorMessage = '';
      const { result } = e as ExecuteMessageResult;
      if (result?.type === 'reverted') {
        errorMessage = result.description;
      } else if (result?.type === 'error') {
        errorMessage = result.error;
      } else {
        errorMessage = 'Something went wrong';
      }

      throw new Error(`Could not swap the required amount of token: ${errorMessage}`);
    }

    return this.transitionToNextPhase(state, 'subsidizePostSwap');
  }
}

export default new NablaSwapPhaseHandler();
