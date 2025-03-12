import { Abi } from '@polkadot/api-contract';
import { ApiPromise, Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';

import {
  createExecuteMessageExtrinsic,
  ExecuteMessageResult,
  Extrinsic,
  readMessage,
  ReadMessageResult,
  submitExtrinsic,
} from '@pendulum-chain/api-solang';

import Big from 'big.js';

import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  getPendulumCurrencyId,
} from '../../constants/tokenConfig';
import { NABLA_ROUTER } from '../../constants/constants';
import { erc20WrapperAbi } from '../../contracts/ERC20Wrapper';
import { routerAbi } from '../../contracts/Router';
import { config } from '../../config';
import {
  createWriteOptions,
  defaultReadLimits,
  defaultWriteLimits,
  multiplyByPowerOfTen,
  parseContractBalanceResponse,
  stringifyBigWithSignificantDecimals,
} from '../../helpers/contracts';

import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { decodeSubmittableExtrinsic } from './signedTransactions';
import { getEphemeralNonce } from './polkadot/ephemeral';

interface CreateAndSignApproveExtrinsicOptions {
  api: ApiPromise;
  token: string;
  spender: string;
  amount: string;
  contractAbi: Abi;
  keypairEphemeral: KeyringPair;
  nonce?: number;
}

async function createAndSignApproveExtrinsic({
  api,
  token,
  spender,
  amount,
  contractAbi,
  keypairEphemeral,
  nonce = -1,
}: CreateAndSignApproveExtrinsicOptions) {
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
  context: ExecutionContext,
): Promise<Extrinsic> {
  const { inputTokenType, inputAmount, pendulumAmountRaw, pendulumEphemeralSeed, nablaApproveNonce, network } = state;
  const { pendulumNode } = context;

  const { ss58Format, api } = pendulumNode;
  // event attempting swap
  const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);

  console.log('swap', 'Preparing the signed extrinsic for the approval of swap', inputAmount.units, inputTokenType);

  const erc20ContractAbi = new Abi(erc20WrapperAbi, api.registry.getChainProperties());

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format: ss58Format });
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

  console.log('prepareNablaApproveTransaction', response);

  if (response.type !== 'success') {
    const message = 'Could not load token allowance';
    console.log(message);
    throw new Error(message);
  }

  const currentAllowance = parseContractBalanceResponse(inputToken.pendulumDecimals, response.value);

  //maybe do allowance
  if (currentAllowance === undefined || currentAllowance.rawBalance.lt(Big(pendulumAmountRaw))) {
    try {
      console.log(`Preparing transaction to approve tokens: ${inputAmount.units} ${inputToken.pendulumAssetSymbol}`);
      return createAndSignApproveExtrinsic({
        api: api,
        amount: pendulumAmountRaw,
        token: inputToken.pendulumErc20WrapperAddress,
        spender: NABLA_ROUTER,
        contractAbi: erc20ContractAbi,
        keypairEphemeral: ephemeralKeypair,
        nonce: nablaApproveNonce,
      });
    } catch (e) {
      console.log(`Could not approve token: ${e}`);
      return Promise.reject('Could not approve token');
    }
  }

  throw Error("Couldn't create approve extrinsic");
}

// Since this operation reads first from chain the current approval, there is no need to
// save any state for potential recovery.
export async function nablaApprove(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const { transactions, inputAmount, inputTokenType, nablaApproveNonce, network } = state;
  const { pendulumNode } = context;

  const { api } = pendulumNode;

  const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);

  if (!transactions) {
    const message = 'Missing transactions for nablaApprove';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }

  const successorState = {
    ...state,
    phase: 'nablaSwap',
  } as const;

  console.log('successorState', successorState);

  const ephemeralAccountNonce = await getEphemeralNonce(state, context);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > nablaApproveNonce) {
    return successorState;
  }

  try {
    console.log(`Approving tokens: ${inputAmount.units} ${inputToken.pendulumAssetSymbol}`);

    const approvalExtrinsic = decodeSubmittableExtrinsic(transactions.nablaApproveTransaction, api);

    const result = await submitExtrinsic(approvalExtrinsic);

    if (result.status.type === 'error') {
      console.log(`Could not approve token: ${result.status.error.toString()}`);
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
    console.log(`Could not approve the required amount of token: ${errorMessage}`);
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
  context: ExecutionContext,
): Promise<Extrinsic> {
  const { api } = context.pendulumNode;

  const {
    inputTokenType,
    outputTokenType,
    inputAmount,
    pendulumAmountRaw,
    outputAmount,
    nablaHardMinimumOutputRaw,
    pendulumEphemeralSeed,
    nablaSwapNonce,
    network,
  } = state;

  // event attempting swap
  const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);
  const outputToken = getOutputTokenDetails(outputTokenType);

  const routerAbiObject = new Abi(routerAbi, api.registry.getChainProperties());

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format: api.registry.chainSS58 });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  // balance before the swap. Important for recovery process.
  // if transaction was able to get in, but we failed on the listening
  const outputCurrencyId = getPendulumCurrencyId(outputTokenType);
  const responseBalanceBefore = await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId);
  const rawBalanceBefore = Big(responseBalanceBefore?.free?.toString() ?? '0');

  // Since this is an ephemeral account, balanceBefore being greater than the minimum amount means that the swap was successful
  // but we missed the event. This is important for recovery process.
  if (rawBalanceBefore.lt(Big(nablaHardMinimumOutputRaw))) {
    // Try swap
    try {
      console.log(
        `Preparing transaction to swap ${inputAmount.units} ${inputToken.pendulumAssetSymbol} to ${outputAmount.units} ${outputToken.fiat.symbol} `,
      );

      return createAndSignSwapExtrinsic({
        api: api,
        amount: pendulumAmountRaw,
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

export async function nablaSwap(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const {
    transactions,
    inputAmount,
    inputTokenType,
    pendulumAmountRaw,
    outputAmount,
    outputTokenType,
    pendulumEphemeralSeed,
    nablaSwapNonce,
    nablaSoftMinimumOutputRaw,
    network,
  } = state;
  const { pendulumNode } = context;

  const { api, ss58Format } = pendulumNode;

  const successorState = {
    ...state,
    phase: 'subsidizePostSwap',
  } as const;

  const ephemeralAccountNonce = await getEphemeralNonce(state, context);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > nablaSwapNonce) {
    return successorState;
  }

  const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);
  const outputToken = getOutputTokenDetails(outputTokenType);

  if (transactions === undefined) {
    const message = 'Missing transactions for nablaSwap';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  // balance before the swap. Important for recovery process.
  // if transaction was able to get in, but we failed on the listening
  const outputCurrencyId = getPendulumCurrencyId(outputTokenType);
  const responseBalanceBefore = await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId);
  const rawBalanceBefore = Big(responseBalanceBefore?.free?.toString() ?? '0');

  try {
    console.log(
      `Swapping ${inputAmount.units} ${inputToken.pendulumAssetSymbol} to ${outputAmount.units} ${outputToken.fiat.symbol} `,
    );

    console.log('before RESPONSE prepareNablaSwapTransaction');
    // get an up to date quote for the AMM
    const response = await readMessage({
      abi: new Abi(routerAbi),
      api,
      contractDeploymentAddress: NABLA_ROUTER,
      callerAddress: ephemeralKeypair.address,
      messageName: 'getAmountOut',
      messageArguments: [pendulumAmountRaw, [inputToken.pendulumErc20WrapperAddress, outputToken.erc20WrapperAddress]],
      limits: defaultReadLimits,
    });

    console.log('prepareNablaSwapTransaction', response);

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
      console.log(`Could not swap token: ${result.status.error.toString()}`);
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
    console.log(`Could not swap the required amount of token: ${errorMessage}`);
    return Promise.reject('Could not swap token');
  }
  //verify token balance before releasing this process.
  const responseBalanceAfter = await api.query.tokens.accounts(ephemeralKeypair.address, outputCurrencyId);
  const rawBalanceAfter = Big(responseBalanceAfter?.free?.toString() ?? '0');

  const actualOfframpValueRaw = rawBalanceAfter.sub(rawBalanceBefore);
  const actualOfframpValue = multiplyByPowerOfTen(actualOfframpValueRaw, -outputToken.decimals);

  console.log(`Swap successful. Amount received: ${stringifyBigWithSignificantDecimals(actualOfframpValue, 2)}`);

  console.log('Swap successful');

  return successorState;
}

const calcDeadline = (min: number) => `${Math.floor(Date.now() / 1000) + min * 60}`;
