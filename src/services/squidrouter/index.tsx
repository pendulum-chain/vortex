import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract,  } from 'wagmi';
import { getTransaction } from '@wagmi/core'
import { wagmiConfig } from '../../wagmiConfig';
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

  const [requiresApproval, setRequiresApproval] = useState(false);
  const [effectiveApprovalHash, setEffectiveApprovalHash] = useState<`0x${string}`>(`0xnothing`);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState(false);

  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, status, error: txCheckError } = useWaitForTransactionReceipt({
    hash: effectiveApprovalHash,
  });

  try{
    if (!isInitialCheckDone && recoveryStatus.approvalHash) {
      const transaction = getTransaction(wagmiConfig,{
        hash: recoveryStatus.approvalHash!,
      })
  
      transaction.then((res) => {
        // we can assume it was included, then.
        if (res.blockNumber){
          setRequiresApproval(false);
          setIsInitialCheckDone(true);
          setEffectiveApprovalHash(recoveryStatus.approvalHash!);
        }
      }).catch((error) => {
        console.error('Error checking transaction:', error);
        setRequiresApproval(true);
        setIsInitialCheckDone(true);
      });
    }
    setRequiresApproval(true);
  }catch{
    throw new Error("saved transaction hash is corrupted")
  }
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
  console.log("isConfirming", isConfirming, "isConfirmed", isConfirmed, "status", status, "txCheckError", txCheckError)
  try{
    if (!isInitialCheckDone && recoveryStatus.swapHash) {
      const transaction = getTransaction(wagmiConfig,{
        hash: recoveryStatus.swapHash!,
      })
  
      transaction.then((res) => {
        // we can assume it was included, then.
        if (res.blockNumber){
          setRequiresSwapTransaction(false);
          setIsInitialCheckDone(true);
          setEffectiveSwapHash(recoveryStatus.swapHash!);
        }
      }).catch((error) => {
        console.error('Error checking transaction:', error);
        setRequiresSwapTransaction(true);
        setIsInitialCheckDone(true);
      });
    }
    setRequiresSwapTransaction(true);
  }catch{
    throw new Error("saved transaction hash is corrupted")
  }
  
  // Store the new hash when it changes
  useEffect(() => {
    if (hash) {

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
    console.log("isSwapCompleted", isSwapCompleted);
    if (isApprovalConfirming) {
      setTransactionStatus(TransactionStatus.ApproveSpending);
    }
    if (isSpendingApproved) {
      setTransactionStatus(TransactionStatus.SpendingApproved);
    }
    if (isSwapConfirming) {
      setTransactionStatus(TransactionStatus.InitiateSwap);
    }  
    if (isSwapCompleted) {
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
    console.log("requiresSwapTransaction", requiresSwapTransaction)
    if (!requiresSwapTransaction) return;

    console.log('Transaction approved, executing swap');
    // Execute the swap transaction
    sendSwapTransaction().catch((error) => console.error('Error sending swap transaction:', error));
  }, [isSpendingApproved, sendSwapTransaction, transactionStatus, requiresSwapTransaction]);

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
