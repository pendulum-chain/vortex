import { getAccount, sendTransaction, waitForTransactionReceipt, writeContract } from '@wagmi/core';
import { SendTransactionErrorType, WriteContractErrorType } from 'viem';
import * as Sentry from '@sentry/react';

import { showToast, ToastMessage } from '../../helpers/notifications';
import { getInputTokenDetails } from '../../constants/tokenConfig';
import erc20ABI from '../../contracts/ERC20';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { getRouteTransactionRequest } from './route';

export async function squidRouter(
  state: OfframpingState,
  { wagmiConfig, setSigningPhase, trackEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const inputToken = getInputTokenDetails(state.network, state.inputTokenType);

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
    inputToken.pendulumErc20WrapperAddress,
    state.inputAmount.units,
  );

  setSigningPhase?.('started');

  let approvalHash;
  try {
    trackEvent({ event: 'signing_requested', index: 1 });
    approvalHash = await writeContract(wagmiConfig, {
      abi: erc20ABI,
      address: inputToken.pendulumErc20WrapperAddress as `0x${string}`,
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
    return { ...state, failure: { type: 'unrecoverable', message: e?.toString() } };
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
    return { ...state, failure: { type: 'unrecoverable', message: e?.toString() } };
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
