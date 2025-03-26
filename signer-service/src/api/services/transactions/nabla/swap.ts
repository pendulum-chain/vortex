import { ApiPromise } from '@polkadot/api';
import { Abi } from '@polkadot/api-contract';
import { createExecuteMessageExtrinsic, Extrinsic } from '@pendulum-chain/api-solang';
import { getPendulumDetails, NABLA_ROUTER, RampCurrency } from '../../../../config/tokens';
import { createWriteOptions, defaultWriteLimits } from '../../../helpers/contracts';
import { API } from '../../pendulum/apiManager';
import { Networks } from '../../../helpers/networks';
import { config } from '../../../../config';
import { routerAbi } from '../../../../contracts/Router';

export interface PrepareNablaSwapParams {
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  amountRaw: string;
  nablaHardMinimumOutputRaw: string;
  pendulumEphemeralAddress: string;
  fromNetwork: Networks;
  toNetwork: Networks;
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
  const { execution } = await createExecuteMessageExtrinsic({
    abi: contractAbi,
    api,
    callerAddress: callerAddress,
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
  });

  if (execution.type === 'onlyRpc') {
    throw Error("Couldn't create swap extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;
  return extrinsic;
}

export async function prepareNablaSwapTransaction({
  inputCurrency,
  outputCurrency,
  amountRaw,
  nablaHardMinimumOutputRaw,
  pendulumEphemeralAddress,
  fromNetwork,
  toNetwork,
  pendulumNode,
}: PrepareNablaSwapParams): Promise<Extrinsic> {
  const { api } = pendulumNode;

  // event attempting swap
  const inputToken = getPendulumDetails(inputCurrency, fromNetwork);
  const outputToken = getPendulumDetails(outputCurrency, toNetwork);
  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());

  // Try create swap extrinsic
  try {
    return createSwapExtrinsic({
      api: api,
      amount: amountRaw,
      amountMin: nablaHardMinimumOutputRaw,
      tokenIn: inputToken.pendulumErc20WrapperAddress,
      tokenOut: outputToken.pendulumErc20WrapperAddress,
      contractAbi: routerAbiObject,
      callerAddress: pendulumEphemeralAddress,
    });
  } catch (e) {
    console.log(`Error creating swap extrinsic: ${e}`);
    throw Error("Couldn't create swap extrinsic");
  }
}
