import * as Sentry from '@sentry/react';
import { Config, getAccount, sendTransaction, writeContract } from '@wagmi/core';
import { Hash, SendTransactionErrorType, WriteContractErrorType } from 'viem';

import { storageKeys, TransactionSubmissionIndices } from '../../../constants/localStorage';
import {
  EvmTokenDetails,
  getOnChainTokenDetails,
  isEvmToken,
  OnChainTokenDetails,
} from '../../../constants/tokenConfig';

import { waitForTransactionConfirmation } from '../../../helpers/safe-wallet/waitForTransactionConfirmation';
import { showToast, ToastMessage } from '../../../helpers/notifications';
import { TrackableEvent } from '../../../contexts/events';
import erc20ABI from '../../../contracts/ERC20';
import { storageService } from '../../../services/storage/local';

import { isOfframpState, OfframpingState } from '../../offrampingFlow';
import { ExecutionContext, FlowState } from '../../flowCommons';
import { getRouteTransactionRequest, TransactionRequest } from './route';

type TrackEvent = (event: TrackableEvent) => void;

async function handleTokenApproval(
  inputToken: EvmTokenDetails,
  transactionRequest: TransactionRequest,
  state: OfframpingState,
  wagmiConfig: Config,
  trackEvent: TrackEvent,
): Promise<Hash> {
  const lastSubmissionIndex = Number(storageService.get(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, '-1'));
  let approvalHash = storageService.get(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL) as Hash;

  if (!approvalHash && lastSubmissionIndex === TransactionSubmissionIndices.SQUIDROUTER_APPROVE - 1) {
    try {
      trackEvent({ event: 'signing_requested', index: 1 });

      approvalHash = await writeContract(wagmiConfig, {
        abi: erc20ABI,
        address: inputToken.erc20AddressSourceChain,
        functionName: 'approve',
        args: [transactionRequest?.target, state.inputAmount.raw],
      });

      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL, approvalHash);
      storageService.set(
        storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX,
        TransactionSubmissionIndices.SQUIDROUTER_APPROVE,
      );

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
  const lastSubmissionIndex = Number(storageService.get(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, '-1'));
  let swapHash = storageService.get(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP) as Hash;

  if (!swapHash && lastSubmissionIndex === TransactionSubmissionIndices.SQUIDROUTER_SWAP - 1) {
    try {
      trackEvent({ event: 'signing_requested', index: 2 });
      swapHash = await sendTransaction(wagmiConfig, {
        to: transactionRequest.target,
        data: transactionRequest.data,
        value: transactionRequest.value,
        gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
      });

      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP, swapHash);
      storageService.set(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, TransactionSubmissionIndices.SQUIDROUTER_SWAP);

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
  state: FlowState,
  { wagmiConfig, setOfframpSigningPhase, trackEvent }: ExecutionContext,
): Promise<FlowState> {
  if (!isOfframpState(state)) {
    throw new Error('State does not have required offramp properties');
  }

  try {
    const inputToken = getOnChainTokenDetails(state.network, state.inputTokenType);
    if (!inputToken || !isEvmToken(inputToken)) {
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

    const confirmedApprovalHash = await waitForTransactionConfirmation(approvalHash, state.networkId);

    setOfframpSigningPhase?.('approved');

    const swapHash = await handleSwapTransaction(transactionRequest, wagmiConfig, trackEvent);

    const confirmedSwapHash = await waitForTransactionConfirmation(swapHash, state.networkId);

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
    storageService.remove(storageKeys.SQUIDROUTER_RECOVERY_STATE_APPROVAL);
    storageService.remove(storageKeys.SQUIDROUTER_RECOVERY_STATE_SWAP);
    return { ...state, failure: { type: 'unrecoverable', message: error?.toString() } };
  }
}
