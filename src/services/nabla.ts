/* eslint-disable @typescript-eslint/no-explicit-any */
import { Abi } from '@polkadot/api-contract';
import Big from 'big.js';
import {
  createExecuteMessageExtrinsic,
  ExecuteMessageResult,
  Extrinsic,
  readMessage,
  ReadMessageResult,
  submitExtrinsic,
} from '@pendulum-chain/api-solang';

import { EventStatus } from '../components/GenericEvent';
import { getApiManagerInstance } from './polkadot/polkadotApi';
import { erc20WrapperAbi } from '../contracts/ERC20Wrapper';
import { routerAbi } from '../contracts/Router';
import { NABLA_ROUTER } from '../constants/constants';
import {
  createWriteOptions,
  defaultReadLimits,
  defaultWriteLimits,
  multiplyByPowerOfTen,
  parseContractBalanceResponse,
  stringifyBigWithSignificantDecimals,
} from '../helpers/contracts';
import {
  getInputTokenDetails,
  getPendulumCurrencyId,
  INPUT_TOKEN_CONFIG,
  OUTPUT_TOKEN_CONFIG,
} from '../constants/tokenConfig';
import { ExecutionContext, OfframpingState } from './offrampingFlow';
import { ApiPromise, Keyring } from '@polkadot/api';
import { decodeSubmittableExtrinsic } from './signedTransactions';
import { config } from '../config';
import { KeyringPair } from '@polkadot/keyring/types';
import { getEphemeralNonce } from './polkadot/ephemeral';

async function createAndSignApproveExtrinsic({
  api,
  token,
  spender,
  amount,
  contractAbi,
  keypairEphemeral,
  nonce = -1,
}: any) {
  console.log('write', `call approve ${token} for ${spender} with amount ${amount} `);

  const { execution, result: readMessageResult } = await createExecuteMessageExtrinsic({
    abi: contractAbi,
    api,
    callerAddress: keypairEphemeral.address,
    contractDeploymentAddress: token,
    messageName: 'approve',
    messageArguments: [spender, amount],
    limits: { ...defaultWriteLimits, ...createWriteOptions(api) },
    gasLimitTolerancePercentage: 10, // Allow 3 fold gas tolerance
  });

  console.log('result', readMessageResult);

  if (execution.type === 'onlyRpc') {
    throw Error("Couldn't create approve extrinsic. Can't execute only-RPC");
  }

  const { extrinsic } = execution;

  return extrinsic.signAsync(keypairEphemeral, { nonce, era: 0 });
}

export async function prepareNablaApproveTransaction(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<Extrinsic> {
  const { inputTokenType, inputAmount, pendulumEphemeralSeed, nablaApproveNonce, network } = state;

  // event attempting swap
  const inputToken = getInputTokenDetails(network, inputTokenType);
  console.log('swap', 'Preparing the signed extrinsic for the approval of swap', inputAmount.units, inputTokenType);
  // get chain api, abi
  const { ss58Format, api } = (await getApiManagerInstance()).apiData!;
  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());
  // get asset details

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  // call the current allowance of the ephemeral
  const response: ReadMessageResult = await readMessage({
    abi: erc20ContractAbi,
    api: api,
    contractDeploymentAddress: inputToken.pendulumErc20WrapperAddress,
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
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(inputAmount.raw))) {
    try {
      renderEvent(`Approving tokens: ${inputAmount.units} ${inputToken.pendulumAssetSymbol}`, EventStatus.Waiting);
      return createAndSignApproveExtrinsic({
        api: api,
        amount: inputAmount.raw,
        token: inputToken.pendulumErc20WrapperAddress,
        spender: NABLA_ROUTER,
        contractAbi: erc20ContractAbi,
        keypairEphemeral: ephemeralKeypair,
        nonce: nablaApproveNonce,
      });
    } catch (e) {
      renderEvent(`Could not approve token: ${e}`, EventStatus.Error);
      return Promise.reject('Could not approve token');
    }
  }

  throw Error("Couldn't create approve extrinsic");
}

// Since this operation reads first from chain the current approval, there is no need to
// save any state for potential recovery.
export async function nablaApprove(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const { transactions, inputAmount, inputTokenType, nablaApproveNonce, network } = state;
  const inputToken = getInputTokenDetails(network, inputTokenType);

  if (!transactions) {
    console.error('Missing transactions for nablaApprove');
    return { ...state, failure: 'unrecoverable' };
  }

  const successorState = {
    ...state,
    phase: 'nablaSwap',
  } as const;

  const ephemeralAccountNonce = await getEphemeralNonce(state);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > nablaApproveNonce) {
    return successorState;
  }

  try {
    renderEvent(`Approving tokens: ${inputAmount.units} ${inputToken.pendulumAssetSymbol}`, EventStatus.Waiting);

    const { api } = (await getApiManagerInstance()).apiData!;

    const approvalExtrinsic = decodeSubmittableExtrinsic(transactions.nablaApproveTransaction, api);

    const result = await submitExtrinsic(approvalExtrinsic);

    if (result.status.type === 'error') {
      renderEvent(`Could not approve token: ${result.status.error.toString()}`, EventStatus.Error);
      return Promise.reject('Could not approve token');
    }
  } catch (e) {
    let errorMessage = '';
    const result = (e as ExecuteMessageResult).result;
    if (result?.type === 'reverted') {
      errorMessage = result.description;
    } else if (result?.type === 'error') {
      errorMessage = result.error;
    } else {
      errorMessage = 'Something went wrong';
    }
    renderEvent(`Could not approve the required amount of token: ${errorMessage}`, EventStatus.Error);
    return Promise.reject('Could not approve token');
  }

  return successorState;
}

interface CreateAndSignSwapExtrinsicOptions {
  api: ApiPromise;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  amountMin: string;
  contractAbi: Abi;
  keypairEphemeral: KeyringPair;
  nonce?: number;
}

export async function createAndSignSwapExtrinsic({
  api,
  tokenIn,
  tokenOut,
  amount,
  amountMin,
  contractAbi,
  keypairEphemeral,
  nonce = -1,
}: CreateAndSignSwapExtrinsicOptions) {
  const { execution } = await createExecuteMessageExtrinsic({
    abi: contractAbi,
    api,
    callerAddress: keypairEphemeral.address,
    contractDeploymentAddress: NABLA_ROUTER,
    messageName: 'swapExactTokensForTokens',
    // Params found at https://github.com/0xamberhq/contracts/blob/e3ab9132dbe2d54a467bdae3fff20c13400f4d84/contracts/src/core/Router.sol#L98
    messageArguments: [
      amount,
      amountMin,
      [tokenIn, tokenOut],
      keypairEphemeral.address,
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
  return extrinsic.signAsync(keypairEphemeral, { nonce, era: 0 });
}

export async function prepareNablaSwapTransaction(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<Extrinsic> {
  const {
    inputTokenType,
    outputTokenType,
    inputAmount,
    outputAmount,
    nablaHardMinimumOutputRaw,
    pendulumEphemeralSeed,
    nablaSwapNonce,
    network,
  } = state;

  // event attempting swap
  const inputToken = getInputTokenDetails(network, inputTokenType);
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  // get chain api, abi
  const { ss58Format, api } = (await getApiManagerInstance()).apiData!;
  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());
  // get asset details

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  // balance before the swap. Important for recovery process.
  // if transaction was able to get in, but we failed on the listening
  const outputCurrencyId = getPendulumCurrencyId(outputTokenType);
  const responseBalanceBefore = (await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId)) as any;
  const rawBalanceBefore = Big(responseBalanceBefore?.free?.toString() ?? '0');

  // Since this is an ephemeral account, balanceBefore being greater than the minimum amount means that the swap was successful
  // but we missed the event. This is important for recovery process.
  if (rawBalanceBefore.lt(Big(nablaHardMinimumOutputRaw))) {
    // Try swap
    try {
      renderEvent(
        `Swapping ${inputAmount.units} ${inputToken.pendulumAssetSymbol} to ${outputAmount.units} ${outputToken.stellarAsset.code.string} `,
        EventStatus.Waiting,
      );

      return createAndSignSwapExtrinsic({
        api: api,
        amount: inputAmount.raw,
        amountMin: nablaHardMinimumOutputRaw,
        tokenIn: inputToken.pendulumErc20WrapperAddress,
        tokenOut: outputToken.erc20WrapperAddress,
        contractAbi: routerAbiObject,
        keypairEphemeral: ephemeralKeypair,
        nonce: nablaSwapNonce,
      });
    } catch (e) {
      return Promise.reject('Could not create swap transaction' + e?.toString());
    }
  }

  throw Error("Couldn't create swap extrinsic");
}

export async function nablaSwap(state: OfframpingState, { renderEvent }: ExecutionContext): Promise<OfframpingState> {
  const {
    transactions,
    inputAmount,
    inputTokenType,
    outputAmount,
    outputTokenType,
    pendulumEphemeralSeed,
    nablaSwapNonce,
    nablaSoftMinimumOutputRaw,
    network,
  } = state;

  const successorState = {
    ...state,
    phase: 'subsidizePostSwap',
  } as const;

  const ephemeralAccountNonce = await getEphemeralNonce(state);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > nablaSwapNonce) {
    return successorState;
  }

  const inputToken = getInputTokenDetails(network, inputTokenType);
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  if (transactions === undefined) {
    console.error('Missing transactions for nablaSwap');
    return { ...state, failure: 'unrecoverable' };
  }

  const { api, ss58Format } = (await getApiManagerInstance()).apiData!;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  // balance before the swap. Important for recovery process.
  // if transaction was able to get in, but we failed on the listening
  const outputCurrencyId = getPendulumCurrencyId(outputTokenType);
  const responseBalanceBefore = (await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId)) as any;
  const rawBalanceBefore = Big(responseBalanceBefore?.free?.toString() ?? '0');

  try {
    renderEvent(
      `Swapping ${inputAmount.units} ${inputToken.pendulumAssetSymbol} to ${outputAmount.units} ${outputToken.stellarAsset.code.string} `,
      EventStatus.Waiting,
    );

    // get an up to date quote for the AMM
    const response = await readMessage({
      abi: new Abi(routerAbi),
      api,
      contractDeploymentAddress: NABLA_ROUTER,
      callerAddress: ephemeralKeypair.address,
      messageName: 'getAmountOut',
      messageArguments: [inputAmount.raw, [inputToken.pendulumErc20WrapperAddress, outputToken.erc20WrapperAddress]],
      limits: defaultReadLimits,
    });

    if (response.type !== 'success') {
      throw new Error("Couldn't get a quote from the AMM");
    }

    const ouputAmountQuoteRaw = Big(response.value[0].toString());
    if (ouputAmountQuoteRaw.lt(Big(nablaSoftMinimumOutputRaw))) {
      throw new Error("Won't execute the swap now. The estimated output amount is too low.");
    }

    const swapExtrinsic = decodeSubmittableExtrinsic(transactions.nablaSwapTransaction, api);
    const result = await submitExtrinsic(swapExtrinsic);

    if (result.status.type === 'error') {
      renderEvent(`Could not swap token: ${result.status.error.toString()}`, EventStatus.Error);
      return Promise.reject('Could not swap token');
    }
  } catch (e) {
    let errorMessage = '';
    const result = (e as ExecuteMessageResult).result;
    if (result?.type === 'reverted') {
      errorMessage = result.description;
    } else if (result?.type === 'error') {
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

  console.log('Swap successful');

  return successorState;
}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;
