import * as Sentry from '@sentry/react';
import { Config, getAccount, sendTransaction, writeContract } from '@wagmi/core';
import { Hash, SendTransactionErrorType, WriteContractErrorType } from 'viem';

import { storageKeys } from '../../../constants/localStorage';
import { EvmInputTokenDetails, getInputTokenDetails, isEvmInputTokenDetails } from '../../../constants/tokenConfig';

import { waitForTransactionConfirmation } from '../../../hooks/safe-wallet/waitForTransactionConfirmation';
import { showToast, ToastMessage } from '../../../helpers/notifications';
import { TrackableEvent } from '../../../contexts/events';
import erc20ABI from '../../../contracts/ERC20';
import { storageService } from '../../../services/storage/local';

import { ExecutionContext, OfframpingState } from '../../offrampingFlow';
import { getRouteTransactionRequest } from './route';

type TrackEvent = (event: TrackableEvent) => void;
type TransactionRequest = { target: string; data: Hash; value: bigint; gasLimit: string };

async function handleTokenApproval(
  inputToken: EvmInputTokenDetails,
  transactionRequest: TransactionRequest,
  state: OfframpingState,
  wagmiConfig: Config,
  trackEvent: TrackEvent,
): Promise<Hash> {
  let approvalHash = storageService.get(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL) as Hash;

  if (!approvalHash) {
    try {
      trackEvent({ event: 'signing_requested', index: 1 });

      approvalHash = await writeContract(wagmiConfig, {
        abi: erc20ABI,
        address: inputToken.erc20AddressSourceChain,
        functionName: 'approve',
        args: [transactionRequest?.target, state.inputAmount.raw],
      });

      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL, approvalHash);

      trackEvent({ event: 'transaction_signed', index: 1 });
    } catch (e) {
      const error = e as WriteContractErrorType;
      handleError(error, 'writeContract', 'Failed to sign transaction');
      throw error;
    }
  }

  return approvalHash;
}

async function handleSwapTransaction(
  transactionRequest: TransactionRequest,
  wagmiConfig: Config,
  trackEvent: TrackEvent,
): Promise<Hash> {
  let swapHash = storageService.get(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP) as Hash;

  if (!swapHash) {
    try {
      trackEvent({ event: 'signing_requested', index: 2 });
      swapHash = await sendTransaction(wagmiConfig, {
        to: transactionRequest.target,
        data: transactionRequest.data,
        value: transactionRequest.value,
        gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
      });

      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP, swapHash);

      trackEvent({ event: 'transaction_signed', index: 2 });
    } catch (e) {
      const error = e as SendTransactionErrorType;
      handleError(error, 'sendTransaction', 'Failed to sign transaction');
      throw error;
    }
  }

  return swapHash;
}

function handleError(error: Error, operation: string, message: string) {
  const errorMessage = 'shortMessage' in error ? error.shortMessage : error.message;
  showToast(ToastMessage.SIGNING_FAILED, `${message}: ${errorMessage}`);

  Sentry.captureException(error, {
    level: 'warning',
    extra: {
      message: `Call to ${operation}() failed in squidRouter()`,
      cause: 'cause' in error ? error.cause : undefined,
    },
  });

  console.error('Error in squidRouter: ', error);
}

export async function squidRouter(
  state: OfframpingState,
  { wagmiConfig, setOfframpSigningPhase, trackEvent }: ExecutionContext,
): Promise<OfframpingState> {
  try {
    const inputToken = getInputTokenDetails(state.network, state.inputTokenType);
    if (!inputToken || !isEvmInputTokenDetails(inputToken)) {
      throw new Error('Invalid input token type for squidRouter. Expected EVM token.');
    }

    const accountData = getAccount(wagmiConfig);
    if (!accountData || !accountData.address) {
      throw new Error('Wallet not connected');
    }

    const { transactionRequest } = await getRouteTransactionRequest(
      accountData.address,
      state.inputAmount.raw,
      state.squidRouterReceiverHash,
      inputToken,
      state.network,
    );

    setOfframpSigningPhase?.('started');

    const approvalHash = await handleTokenApproval(inputToken, transactionRequest, state, wagmiConfig, trackEvent);

    const confirmedApprovalHash = await waitForTransactionConfirmation(approvalHash);

    setOfframpSigningPhase?.('approved');

    const swapHash = await handleSwapTransaction(transactionRequest, wagmiConfig, trackEvent);

    const confirmedSwapHash = await waitForTransactionConfirmation(swapHash);

    setOfframpSigningPhase?.('signed');

    const axelarScanLink = 'https://axelarscan.io/gmp/' + swapHash;
    console.log(`Squidrouter Swap Initiated! Check Axelarscan for details: ${axelarScanLink}`);

    setOfframpSigningPhase?.('finished');

    storageService.remove(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL);
    storageService.remove(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP);

    return {
      ...state,
      squidRouterApproveHash: confirmedApprovalHash as Hash,
      squidRouterSwapHash: confirmedSwapHash as Hash,
      phase: 'pendulumFundEphemeral',
    };
  } catch (error) {
    return { ...state, failure: { type: 'unrecoverable', message: error?.toString() } };
  }
}
