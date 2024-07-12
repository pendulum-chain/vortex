import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useCallback, useEffect, useState } from 'preact/compat';
import { getRouteTransactionRequest } from './route';
import erc20ABI from '../../contracts/ERC20';
import { getSquidRouterConfig } from './config';

import { storageService } from '../../services/localStorage';
import { storageKeys } from '../../constants/localStorage';

type RecoveryStatus = {
  approvalHash: `0x${string}` | undefined;
  swapHash: `0x${string}` | undefined;
  transactionRequest: any;
};

function useApproveSpending(
  transactionRequestTarget: string | undefined,
  fromToken: `0x${string}`,
  fromAmount: string,
  recoveryStatus: RecoveryStatus,
) {
  const [effectiveApprovalHash, setEffectiveApprovalHash] = useState(recoveryStatus.approvalHash);
  const [requiresApproval, setRequiresReapproval] = useState(false);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState(false);

  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, status, error: txCheckError } = useWaitForTransactionReceipt({
    hash: effectiveApprovalHash,
  });

  console.log("approval status", status)
  console.log("approval isConfirming", isConfirming)
  console.log("approval isConfirmed", isConfirmed)  
  console.log(" approval txCheckError", txCheckError)

  useEffect(() => {
    if (isInitialCheckDone) {
      return;
    }
    if (!effectiveApprovalHash) {
      setRequiresReapproval(true);
      setIsInitialCheckDone(true);
      return;
    } 
    if (status === "error" ) {
      setRequiresReapproval(true);
      setIsInitialCheckDone(true);
    }
  }, [status, effectiveApprovalHash]);

  // Store the new hash when it changes
  useEffect(() => {
    if (hash) {
      setEffectiveApprovalHash(hash);
      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, { ...recoveryStatus, approvalHash: hash });
    }
  }, [hash]);

  const approveSpending = useCallback(async () => {

      console.log('Asking for approval of', transactionRequestTarget, fromToken, fromAmount);
      writeContract({
        abi: erc20ABI,
        address: fromToken,
        functionName: 'approve',
        args: [transactionRequestTarget, fromAmount],
      });
    
  }, [fromToken, fromAmount, transactionRequestTarget, writeContract, status]);

  return {
    approveSpending,
    error,
    isPending,
    isConfirming,
    isConfirmed,
    requiresApproval
  };
}

function useSendSwapTransaction(transactionRequest: any,  recoveryStatus: RecoveryStatus) {
  const [effectiveSwaplHash, setEffectiveSwapHash] = useState(recoveryStatus.swapHash);
  const [requiresSwapTransaction, setRequiresSwapTransaction] = useState(false);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState(false);

  const { data: hash, isPending, error, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed, status, error: txCheckError } = useWaitForTransactionReceipt({ hash: effectiveSwaplHash });

  console.log("status", status)
  console.log("isConfirming", isConfirming)
  console.log("isConfirmed", isConfirmed)  
  console.log("txCheckError", txCheckError)


  useEffect(() => {
    if (isInitialCheckDone) {
      return;
    }
    if (!effectiveSwaplHash) {
      setRequiresSwapTransaction(true);
      setIsInitialCheckDone(true);
      return;
    } 
    // if the previous stored transaction failed, we need to try again
    // at this point we assume the approval was successful
    if (status === "error" ) {
      setRequiresSwapTransaction(true);
      setIsInitialCheckDone(true);
    }
  }, [status, effectiveSwaplHash]);

  // Store the new hash when it changes
  useEffect(() => {
    if (hash) {
      setEffectiveSwapHash(hash);
      storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, { ...recoveryStatus, swapHash: hash });
    }
  }, [hash]);

  const sendSwapTransaction = useCallback(async () => {
    if (!transactionRequest) {
      console.error('No transaction request found');
      return;
    }
    // Execute the swap transaction
    sendTransaction({
      to: transactionRequest.target,
      data: transactionRequest.data,
      value: transactionRequest.value,
      gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
    });
  }, [transactionRequest, sendTransaction]);

  

  return {
    hash,
    error,
    sendSwapTransaction,
    isConfirming,
    isConfirmed,
    requiresSwapTransaction,
  };
}

export enum TransactionStatus {
  Idle = 'Idle',
  RouteRequested = 'RouteRequested',
  ApproveSpending = 'ApproveSpending',
  SpendingApproved = 'SpendingApproved',
  InitiateSwap = 'InitiateSwap',
  SwapCompleted = 'SwapCompleted',
}

export function useSquidRouterSwap(amount: string) {
  const { fromToken } = getSquidRouterConfig();

  let recoveryStatus = storageService.getParsed<RecoveryStatus>(storageKeys.SQUIDROUTER_RECOVERY_STATE);

  const [requestId, setRequestId] = useState<string>('');
  const [transactionRequest, setTransactionRequest] = useState<any>(recoveryStatus?.transactionRequest);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(TransactionStatus.Idle);

  if (!recoveryStatus) {
    recoveryStatus = {
      approvalHash: undefined,
      swapHash: undefined,
      transactionRequest: undefined,
    };
  }

  const accountData = useAccount();

  const {
    approveSpending,
    isConfirming: isApprovalConfirming,
    isConfirmed: isSpendingApproved,
    error: approveError,
    requiresApproval,
  } = useApproveSpending(transactionRequest?.target, fromToken, amount, recoveryStatus);

  const {
    hash,
    isConfirming: isSwapConfirming,
    isConfirmed: isSwapCompleted,
    sendSwapTransaction,
    error: swapError,
    requiresSwapTransaction,
  } = useSendSwapTransaction(transactionRequest, recoveryStatus);
  // Update the transaction status
  useEffect(() => {
    if (isApprovalConfirming) {
      setTransactionStatus(TransactionStatus.ApproveSpending);
    } else if (isSpendingApproved) {
      setTransactionStatus(TransactionStatus.SpendingApproved);
    } else if (isSwapConfirming) {
      setTransactionStatus(TransactionStatus.InitiateSwap);
    } else if (isSwapCompleted) {
      setTransactionStatus(TransactionStatus.SwapCompleted);
    }
  }, [
    approveError,
    swapError,
    isApprovalConfirming,
    isSpendingApproved,
    isSwapConfirming,
    isSwapCompleted,
    transactionStatus,
  ]);

  useEffect(() => {
    if (!transactionRequest || transactionStatus !== TransactionStatus.RouteRequested) return;
    if (!requiresApproval) return;
    
    console.log('Calling function to approve spending');
    // Approve the transactionRequest.target to spend fromAmount of fromToken
    approveSpending().catch((error) => console.error('Error approving spending:', error));
  }, [approveSpending, transactionRequest, transactionStatus, requiresApproval]);

  useEffect(() => {
    if (!isSpendingApproved || transactionStatus !== TransactionStatus.SpendingApproved ) return;
    if (!requiresSwapTransaction) return;

    console.log('Transaction approved, executing swap');
    // Execute the swap transaction
    sendSwapTransaction().catch((error) => console.error('Error sending swap transaction:', error));
  }, [isSpendingApproved, sendSwapTransaction, transactionStatus]);

  useEffect(() => {
    if (!hash || !isSwapCompleted) return;

    console.log('Transaction confirmed!');
    // Show the transaction receipt with Axelarscan link
    const axelarScanLink = 'https://axelarscan.io/gmp/' + hash;
    console.log(`Finished! Check Axelarscan for details: ${axelarScanLink}`);

    // Update transaction status until it completes
    // We don't do anything with the follow-up for now, but we might in the future
    // updateTransactionStatus(hash, requestId).catch((error) =>
    //    console.error('Error updating transaction status:', error),
    //  );
  }, [hash, isSwapCompleted]);

  const executeSquidRouterSwap = useCallback(async () => {
    if (!accountData.address || !amount) {
      console.error('No account address found or amount found');
      return;
    }

    // Reset the transaction status
    setTransactionStatus(TransactionStatus.RouteRequested);

    // Start by getting the transaction request for the Route
    // if transcation request exists on store, we just set it 
    if (recoveryStatus.transactionRequest) {
      return;
    }

    getRouteTransactionRequest(accountData.address, amount)
      .then(({ requestId, transactionRequest }) => {
        setRequestId(requestId);
        setTransactionRequest(transactionRequest);
        storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, { ...recoveryStatus, transactionRequest });
      })
      .catch((error) => console.error('Error sending transaction request:', error));
  }, [accountData.address, amount, recoveryStatus]);

  return {
    transactionStatus,
    executeSquidRouterSwap,
    error: approveError || swapError,
  };
}
