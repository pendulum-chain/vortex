import { writeContract, sendTransaction, getAccount } from '@wagmi/core';

import { INPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import erc20ABI from '../../contracts/ERC20';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { waitForEvmTransaction } from '../evmTransactions';
import { getRouteTransactionRequest } from './route';

export async function squidRouter(
  state: OfframpingState,
  { wagmiConfig, setSigningPhase }: ExecutionContext,
): Promise<OfframpingState> {
  const inputToken = INPUT_TOKEN_CONFIG[state.inputTokenType];
  const fromTokenErc20Address = inputToken.erc20AddressSourceChain;

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

  console.log('Asking for approval of', transactionRequest?.target, fromTokenErc20Address, state.inputAmount.units);

  setSigningPhase?.('started');

  let approvalHash;
  try {
    approvalHash = await writeContract(wagmiConfig, {
      abi: erc20ABI,
      address: fromTokenErc20Address,
      functionName: 'approve',
      args: [transactionRequest?.target, state.inputAmount.raw],
    });
  } catch (e) {
    console.error('Error in squidRouter: ', e);
    return { ...state, failure: 'unrecoverable' };
  }

  setSigningPhase?.('approved');

  await waitForEvmTransaction(approvalHash, wagmiConfig);

  let swapHash;
  try {
    swapHash = await sendTransaction(wagmiConfig, {
      to: transactionRequest.target,
      data: transactionRequest.data,
      value: transactionRequest.value,
      gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
    });
  } catch (e) {
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
