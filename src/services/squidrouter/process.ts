import { getAccount, sendTransaction, waitForTransactionReceipt, writeContract } from '@wagmi/core';
import { SendTransactionErrorType, WriteContractErrorType } from 'viem';
import * as Sentry from '@sentry/react';

import { showToast, ToastMessage } from '../../helpers/notifications';
import { INPUT_TOKEN_CONFIG, isEvmInputTokenDetails } from '../../constants/tokenConfig';
import erc20ABI from '../../contracts/ERC20';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { getRouteTransactionRequest } from './route';

export async function squidRouter(
  state: OfframpingState,
  { wagmiConfig, setSigningPhase, trackEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const inputToken = INPUT_TOKEN_CONFIG[state.network][state.inputTokenType];
  if (!inputToken || !isEvmInputTokenDetails(inputToken)) {
    throw new Error(`Input token ${state.inputTokenType} not supported on network ${state.network}`);
  }

  const accountData = getAccount(wagmiConfig);
  if (accountData?.address === undefined) {
    throw new Error('Wallet not connected');
  }

  const { transactionRequest } = await getRouteTransactionRequest(
    accountData.address,
    state.inputAmount.raw,
    state.squidRouterReceiverHash,
    inputToken,
  );

  console.log(
    'Asking for approval of',
    transactionRequest?.target,
    inputToken.erc20AddressSourceChain,
    state.inputAmount.units,
  );

  setSigningPhase?.('started');

  let approvalHash;
  try {
    trackEvent({ event: 'signing_requested', index: 1 });
    approvalHash = await writeContract(wagmiConfig, {
      abi: erc20ABI,
      address: inputToken.erc20AddressSourceChain,
      functionName: 'approve',
      args: [transactionRequest?.target, state.inputAmount.raw],
    });
    trackEvent({ event: 'transaction_signed', index: 1 });
  } catch (e) {
    const error = e as WriteContractErrorType;

    const message = 'shortMessage' in error ? error.shortMessage : error.message;

    showToast(ToastMessage.SIGNING_FAILED, 'Failed to sign transaction: ' + message);

    Sentry.captureException(error, {
      level: 'warning',
      extra: {
        message: 'Call to writeContract() failed in squidRouter()',
        cause: 'cause' in error ? error.cause : undefined,
      },
    });

    console.error('Error in squidRouter: ', e);
    return { ...state, failure: 'unrecoverable' };
  }

  setSigningPhase?.('approved');

  await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash });

  let swapHash;
  try {
    trackEvent({ event: 'signing_requested', index: 2 });
    swapHash = await sendTransaction(wagmiConfig, {
      to: transactionRequest.target,
      data: transactionRequest.data,
      value: transactionRequest.value,
      gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
    });
    trackEvent({ event: 'transaction_signed', index: 2 });
  } catch (e) {
    const error = e as SendTransactionErrorType;

    const message = 'shortMessage' in error ? error.shortMessage : error.message;

    showToast(ToastMessage.SIGNING_FAILED, 'Failed to sign transaction: ' + message);
    Sentry.captureException(error, {
      level: 'warning',
      extra: {
        message: 'Call to sendTransaction() failed in squidRouter()',
        cause: 'cause' in error ? error.cause : undefined,
      },
    });

    console.error('Error in squidRouter: ', e);
    return { ...state, failure: 'unrecoverable' };
  }

  setSigningPhase?.('signed');

  const axelarScanLink = 'https://axelarscan.io/gmp/' + swapHash;
  console.log(`Squidrouter Swap Initiated! Check Axelarscan for details: ${axelarScanLink}`);

  setSigningPhase?.('finished');

  return {
    ...state,
    squidRouterApproveHash: approvalHash,
    squidRouterSwapHash: swapHash,
    phase: 'pendulumFundEphemeral',
  };
}
