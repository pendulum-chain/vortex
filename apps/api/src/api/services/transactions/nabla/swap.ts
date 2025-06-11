import { NABLA_ROUTER, PendulumDetails } from '@packages/shared';
import { Extrinsic, createExecuteMessageExtrinsic } from '@pendulum-chain/api-solang';
import { ApiPromise } from '@polkadot/api';
import { Abi } from '@polkadot/api-contract';
import { config } from '../../../../config';
import logger from '../../../../config/logger';
import { routerAbi } from '../../../../contracts/Router';
import { createWriteOptions, defaultWriteLimits } from '../../../helpers/contracts';
import { API } from '../../pendulum/apiManager';
import { ExtrinsicOptions } from './index';

export interface PrepareNablaSwapParams {
  inputTokenDetails: PendulumDetails;
  outputTokenDetails: PendulumDetails;
  amountRaw: string;
  nablaHardMinimumOutputRaw: string;
  pendulumEphemeralAddress: string;
  pendulumNode: API;
}

interface CreateSwapExtrinsicOptions {
  api: ApiPromise;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  amountMin: string;
  contractAbi: Abi;
  callerAddress: string;
}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;

export async function createSwapExtrinsic({
  api,
  tokenIn,
  tokenOut,
  amount,
  amountMin,
  contractAbi,
  callerAddress,
}: CreateSwapExtrinsicOptions) {
  const extrinsicOptions: ExtrinsicOptions = {
    callerAddress,
    contractDeploymentAddress: NABLA_ROUTER,
    messageName: 'swapExactTokensForTokens',
    // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
    messageArguments: [
      amount,
      amountMin,
      [tokenIn, tokenOut],
      callerAddress,
      calcDeadline(config.swap.deadlineMinutes),
    ],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
    skipDryRunning: true, // We have to skip this because it will not work before the approval transaction executed
  };

  const { execution } = await createExecuteMessageExtrinsic({
    ...extrinsicOptions,
    api,
    abi: contractAbi,
  });

  if (execution.type === 'onlyRpc') {
    throw Error("Couldn't create swap extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;
  return { extrinsic, extrinsicOptions };
}

export async function prepareNablaSwapTransaction({
  inputTokenDetails,
  outputTokenDetails,
  amountRaw,
  nablaHardMinimumOutputRaw,
  pendulumEphemeralAddress,
  pendulumNode,
}: PrepareNablaSwapParams): Promise<{
  extrinsic: Extrinsic;
  extrinsicOptions: ExtrinsicOptions;
}> {
  const { api } = pendulumNode;

  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());

  // Try create swap extrinsic
  try {
    logger.info(
      `Preparing transaction to swap tokens: ${amountRaw} ${inputTokenDetails.pendulumAssetSymbol} -> min ${nablaHardMinimumOutputRaw} ${outputTokenDetails.pendulumAssetSymbol}`,
    );
    return createSwapExtrinsic({
      api,
      amount: amountRaw,
      amountMin: nablaHardMinimumOutputRaw,
      tokenIn: inputTokenDetails.pendulumErc20WrapperAddress,
      tokenOut: outputTokenDetails.pendulumErc20WrapperAddress,
      contractAbi: routerAbiObject,
      callerAddress: pendulumEphemeralAddress,
    });
  } catch (e) {
    logger.error(`Error creating swap extrinsic: ${e}`);
    throw Error("Couldn't create swap extrinsic");
  }
}
