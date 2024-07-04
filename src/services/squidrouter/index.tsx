import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useCallback, useEffect, useState } from 'preact/compat';
import { getRouteTransactionRequest, updateTransactionStatus } from './route';
import { erc20Abi } from '../../contracts/Erc20';
import { getSquidRouterConfig } from './config';

function useApproveSpending(
  transactionRequestTarget: string | undefined,
  fromToken: `0x${string}`,
  fromAmount: string,
) {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const approveSpending = useCallback(async () => {
    console.log('Asking for approval of', transactionRequestTarget, fromToken, fromAmount);

    writeContract({
      abi: erc20Abi,
      address: fromToken,
      functionName: 'approve',
      args: [transactionRequestTarget, fromAmount],
    });
  }, [fromToken, transactionRequestTarget, writeContract]);

  return {
    approveSpending,
    error,
    isPending,
    isConfirming,
    isConfirmed,
  };
}

function useSendSwapTransaction(transactionRequest: any) {
  const { data: hash, isPending, error, status, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: hash });

  const sendSwapTransaction = useCallback(async () => {
    if (!transactionRequest) {
      console.error('No transaction request found');
      return;
    }

    console.log('Sending swap transaction');

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
  };
}

enum TransactionStatus {
  Idle = 'Idle',
  RouteRequested = 'RouteRequested',
  ApproveSpending = 'ApproveSpending',
  SpendingApproved = 'SpendingApproved',
  InitiateSwap = 'InitiateSwap',
  SwapCompleted = 'SwapCompleted',
}

export function useSquidRouterSwap(amount: string) {
  const { fromToken } = getSquidRouterConfig();

  const [requestId, setRequestId] = useState<string>('');
  const [transactionRequest, setTransactionRequest] = useState<any>();
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(TransactionStatus.Idle);

  const accountData = useAccount();

  const {
    approveSpending,
    isConfirming: isApprovalConfirming,
    isConfirmed: isSpendingApproved,
    error: approveError,
  } = useApproveSpending(transactionRequest?.target, fromToken, amount);

  const {
    hash,
    isConfirming: isSwapConfirming,
    isConfirmed: isSwapCompleted,
    sendSwapTransaction,
    error: swapError,
  } = useSendSwapTransaction(transactionRequest);

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

    console.log('Calling function to approve spending');
    // Approve the transactionRequest.target to spend fromAmount of fromToken
    approveSpending().catch((error) => console.error('Error approving spending:', error));
  }, [approveSpending, transactionRequest, transactionStatus]);

  useEffect(() => {
    if (!isSpendingApproved || transactionStatus !== TransactionStatus.SpendingApproved) return;

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
    updateTransactionStatus(hash, requestId).catch((error) =>
      console.error('Error updating transaction status:', error),
    );
  }, [hash, isSwapCompleted]);

  const executeSquidRouterSwap = useCallback(async () => {
    if (!accountData.address || !amount) {
      console.error('No account address found or amount found');
      return;
    }

    // Reset the transaction status
    setTransactionStatus(TransactionStatus.RouteRequested);

    // Start by getting the transaction request for the Route
    getRouteTransactionRequest(accountData.address, amount)
      .then(({ requestId, transactionRequest }) => {
        setRequestId(requestId);
        setTransactionRequest(transactionRequest);
      })
      .catch((error) => console.error('Error sending transaction request:', error));
  }, [accountData.address, amount]);

  return {
    transactionStatus,
    executeSquidRouterSwap,
    error: approveError || swapError,
  };
}
