import { writeContract, sendTransaction, getAccount } from '@wagmi/core';
import { Keyring } from '@polkadot/api';

import { INPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import erc20ABI from '../../contracts/ERC20';
import { getApiManagerInstance } from '../polkadot/polkadotApi';
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

  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(state.pendulumEphemeralSeed);

  const { transactionRequest } = await getRouteTransactionRequest(
    accountData.address,
    state.inputAmount.raw,
    ephemeralKeypair.address,
    inputToken,
  );

  console.log('Asking for approval of', transactionRequest?.target, fromTokenErc20Address, state.inputAmount.units);

  setSigningPhase?.('started');

  const approvalHash = await writeContract(wagmiConfig, {
    abi: erc20ABI,
    address: fromTokenErc20Address,
    functionName: 'approve',
    args: [transactionRequest?.target, state.inputAmount.raw],
  });

  setSigningPhase?.('approved');

  await waitForEvmTransaction(approvalHash, wagmiConfig);

  const swapHash = await sendTransaction(wagmiConfig, {
    to: transactionRequest.target,
    data: transactionRequest.data,
    value: transactionRequest.value,
    gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
  });

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
