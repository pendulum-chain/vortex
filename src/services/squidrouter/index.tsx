import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useCallback, useEffect, useState } from 'preact/compat';
import { sendTransactionRequest, updateTransactionStatus } from './route';
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

  console.log('Asking for approval of', transactionRequestTarget, fromToken, fromAmount);

  const approveSpending = useCallback(async () => {
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
  const { data: hash, isPending, error, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: hash });

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

export function useSquidRouterSwap(amount: string) {
  const { fromToken } = getSquidRouterConfig();

  // Set up parameters for bridging the tokens and later calling the receiver contract
  const accountData = useAccount();

  const [requestId, setRequestId] = useState<string>('');
  const [transactionRequest, setTransactionRequest] = useState<any>();
  const {
    approveSpending,
    isConfirmed: isSpendingApproved,
    error: approveError,
  } = useApproveSpending(transactionRequest?.target, fromToken, amount);

  const {
    hash,
    isConfirmed: isSwapCompleted,
    sendSwapTransaction,
    isConfirming,
    error: swapError,
  } = useSendSwapTransaction(transactionRequest);

  useEffect(() => {
    if (!transactionRequest) return;

    console.log('Calling function to approve spending');
    // Approve the transactionRequest.target to spend fromAmount of fromToken
    approveSpending().catch((error) => console.error('Error approving spending:', error));
  }, [approveSpending, transactionRequest]);

  useEffect(() => {
    if (!isSpendingApproved) return;

    console.log('Transaction approved, executing swap');
    // Execute the swap transaction
    sendSwapTransaction().catch((error) => console.error('Error sending swap transaction:', error));
  }, [isSpendingApproved, sendSwapTransaction]);

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

  const doSwap = useCallback(async () => {
    if (!accountData.address || !amount) {
      console.error('No account address found or amount found');
      return;
    }

    sendTransactionRequest(accountData.address, amount)
      .then(({ requestId, transactionRequest }) => {
        setRequestId(requestId);
        setTransactionRequest(transactionRequest);
      })
      .catch((error) => console.error('Error sending transaction request:', error));
  }, [accountData.address, amount]);

  return doSwap;
}
