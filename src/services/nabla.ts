import { Abi } from '@polkadot/api-contract';
import Big from 'big.js';
import {
  readMessage,
  ReadMessageResult,
  executeMessage,
  ExecuteMessageResult,
  createExecuteMessageExtrinsic,
  signExtrinsic,
} from '@pendulum-chain/api-solang';

import { EventStatus } from '../components/GenericEvent';
import { getApiManagerInstance } from './polkadot/polkadotApi';
import { erc20WrapperAbi } from '../contracts/ERC20Wrapper';
import { routerAbi } from '../contracts/Router';
import { NABLA_ROUTER } from '../constants/constants';
import { defaultReadLimits, multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { parseContractBalanceResponse } from '../helpers/contracts';
import { INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG, getPendulumCurrencyId } from '../constants/tokenConfig';
import { defaultWriteLimits, createWriteOptions } from '../helpers/contracts';
import { ExecutionContext, OfframpingState } from './offrampingFlow';
import { Keyring } from '@polkadot/api';

// Since this operation reads first from chain the current approval, there is no need to
// save any state for potential recovery.
export async function nablaApprove(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const { inputTokenType, inputAmountNabla, pendulumEphemeralSeed } = state;

  // event attempting swap
  const inputToken = INPUT_TOKEN_CONFIG[inputTokenType];

  console.log('swap', 'Attempting swap', inputAmountNabla.units, inputTokenType);
  // get chain api, abi
  const { ss58Format, api } = (await getApiManagerInstance()).apiData!;
  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());
  // get asset details

  // get ephermal keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  // call the current allowance of the ephemeral
  const response: ReadMessageResult = await readMessage({
    abi: erc20ContractAbi,
    api: api,
    contractDeploymentAddress: inputToken.axelarEquivalent.pendulumErc20WrapperAddress,
    callerAddress: ephemeralKeypair.address,
    messageName: 'allowance',
    messageArguments: [ephemeralKeypair.address, NABLA_ROUTER],
    limits: defaultReadLimits,
  });

  if (response.type !== 'success') {
    const message = 'Could not load token allowance';
    renderEvent(message, EventStatus.Error);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputToken.decimals, response.value);

  //maybe do allowance
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(inputAmountNabla.raw))) {
    try {
      renderEvent(
        `Approving tokens: ${inputAmountNabla.units} ${inputToken.axelarEquivalent.pendulumAssetSymbol}`,
        EventStatus.Waiting,
      );
      await approve({
        api: api,
        amount: inputAmountNabla.raw,
        token: inputToken.axelarEquivalent.pendulumErc20WrapperAddress,
        spender: NABLA_ROUTER,
        contractAbi: erc20ContractAbi,
        keypairEphemeral: ephemeralKeypair,
      });
    } catch (e) {
      renderEvent(`Could not approve token: ${e}`, EventStatus.Error);
      return Promise.reject('Could not approve token');
    }
  }

  return {
    ...state,
    phase: 'nablaSwap',
  };
}

export async function nablaSwap(state: OfframpingState, { renderEvent }: ExecutionContext): Promise<OfframpingState> {
  const { inputTokenType, outputTokenType, inputAmountNabla, outputAmount, pendulumEphemeralSeed, transactions } =
    state;

  if (transactions === undefined) {
    console.error('Missing transactions for nablaSwap');
    return { ...state, phase: 'failure' };
  }
  const { nablaSwapTransaction, nablaApproveTransaction } = transactions;

  // event attempting swap
  const inputToken = INPUT_TOKEN_CONFIG[inputTokenType];
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  // get chain api, abi
  const { ss58Format, api } = (await getApiManagerInstance()).apiData!;
  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());
  // get asset details

  // get ephermal keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  // balance before the swap. Important for recovery process.
  // if transaction was able to get in, but we failed on the listening
  const outputCurrencyId = getPendulumCurrencyId(outputTokenType);
  const responseBalanceBefore = (await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId)) as any;
  const rawBalanceBefore = Big(responseBalanceBefore?.free?.toString() ?? '0');

  // Since this is an ephemeral account, balanceBefore being greater than the minimum amount means that the swap was successful
  // but we missed the event. This is important for recovery process.
  if (rawBalanceBefore.lt(Big(outputAmount.raw))) {
    // Try swap
    try {
      renderEvent(
        `Swapping ${inputAmountNabla.units} ${inputToken.axelarEquivalent.pendulumAssetSymbol} to ${outputAmount.units} ${outputToken.stellarAsset.code.string} `,
        EventStatus.Waiting,
      );

      await doActualSwap({
        api: api,
        amount: inputAmountNabla.raw, // toString can render exponential notation
        amountMin: outputAmount.raw, // toString can render exponential notation
        tokenIn: inputToken.axelarEquivalent.pendulumErc20WrapperAddress,
        tokenOut: outputToken.erc20WrapperAddress,
        contractAbi: routerAbiObject,
        keypairEphemeral: ephemeralKeypair,
      });
    } catch (e) {
      let errorMessage = '';
      const result = (e as ExecuteMessageResult).result;
      if (result.type === 'reverted') {
        errorMessage = result.description;
      } else if (result.type === 'error') {
        errorMessage = result.error;
      } else {
        errorMessage = 'Something went wrong';
      }
      renderEvent(`Could not swap the required amount of token: ${errorMessage}`, EventStatus.Error);
      return Promise.reject('Could not swap token');
    }

    //verify token balance before releasing this process.
    const responseBalanceAfter = (await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId)) as any;
    const rawBalanceAfter = Big(responseBalanceAfter?.free?.toString() ?? '0');

    const actualOfframpValueRaw = rawBalanceAfter.sub(rawBalanceBefore);

    const actualOfframpValue = multiplyByPowerOfTen(actualOfframpValueRaw, -outputToken.decimals);

    renderEvent(
      `Swap successful. Amount received: ${stringifyBigWithSignificantDecimals(actualOfframpValue, 2)}`,
      EventStatus.Success,
    );
  }

  return {
    ...state,
    phase: 'executeSpacewalkRedeem',
  };
}

async function approve({ api, token, spender, amount, contractAbi, keypairEphemeral }: any) {
  console.log('write', `call approve ${token} for ${spender} with amount ${amount} `);

  const response = await executeMessage({
    abi: contractAbi,
    api,
    callerAddress: keypairEphemeral.address,
    contractDeploymentAddress: token,
    getSigner: () =>
      Promise.resolve({
        type: 'keypair',
        keypair: keypairEphemeral,
      }),
    messageName: 'approve',
    messageArguments: [spender, amount],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  });

  console.log('write', 'call approve response', keypairEphemeral.address, [spender, amount], response);

  if (response?.result?.type !== 'success') throw response;
  return response;
}

export async function createAndSignSwapExtrinsic({
  api,
  tokenIn,
  tokenOut,
  amount,
  amountMin,
  contractAbi,
  keypairEphemeral,
}: any) {
  const { execution, result: readMessageResult } = await createExecuteMessageExtrinsic({
    abi: contractAbi,
    api,
    callerAddress: keypairEphemeral.address,
    contractDeploymentAddress: NABLA_ROUTER,
    messageName: 'swapExactTokensForTokens',
    // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
    messageArguments: [amount, amountMin, [tokenIn, tokenOut], keypairEphemeral.address, calcDeadline(5)],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  });

  if (execution.type === 'onlyRpc') {
    return undefined;
  }

  const signer = keypairEphemeral;
  const { extrinsic } = execution;

  const signedExtrinsic = signExtrinsic(extrinsic, signer);
}

async function doActualSwap({ api, tokenIn, tokenOut, amount, amountMin, contractAbi, keypairEphemeral }: any) {
  console.log('write', `call swap ${tokenIn} for ${tokenOut} with amount ${amount}, minimum expexted ${amountMin} `);

  const response = await executeMessage({
    abi: contractAbi,
    api,
    callerAddress: keypairEphemeral.address,
    contractDeploymentAddress: NABLA_ROUTER,
    getSigner: () =>
      Promise.resolve({
        type: 'keypair',
        keypair: keypairEphemeral,
      }),
    messageName: 'swapExactTokensForTokens',
    // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
    messageArguments: [amount, amountMin, [tokenIn, tokenOut], keypairEphemeral.address, calcDeadline(5)],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  });

  if (response?.result?.type !== 'success') throw response;
  return response;
}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;
