import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { moonbeam } from 'viem/chains';

import { Networks } from '../../../helpers/networks';
import { getRoute } from './route';
import { createOnrampRouteParams } from './route';

import erc20ABI from '../../../../contracts/ERC20';
import { AXL_USDC_MOONBEAM, EvmToken, OnChainToken } from '../../../../config/tokens';

export interface OnrampSquidrouterParams {
  fromAddress: string;
  amount: string;
  outputToken: OnChainToken;
  toNetwork: Networks;
  addressDestination: string;
  moonbeamEphemeralSeed: `0x${string}`;
  moonbeamEphemeralStartingNonce: number;
}

export async function createOnrampSquidrouterTransaction(
  params: OnrampSquidrouterParams,
): Promise<{ squidrouterApproveTransaction: string; squidrouterSwapTransaction: string }> {
  if (params.toNetwork === Networks.AssetHub) {
    return { squidrouterApproveTransaction: '0x', squidrouterSwapTransaction: '0x' };
  }
  const account = mnemonicToAccount(params.moonbeamEphemeralSeed);

  const moonbeamWalletClient = createWalletClient({
    account,
    chain: moonbeam,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http(),
  });

  const routeParams = createOnrampRouteParams(
    account.address,
    params.amount,
    params.outputToken as EvmToken,
    params.toNetwork,
    params.addressDestination,
  );
  const routeResult = await getRoute(routeParams);

  const route = routeResult.data.route;

  const transactionRequest = route.transactionRequest;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [transactionRequest?.target, params.amount],
  });

  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  const squidrouterApproveTransaction = await moonbeamWalletClient.signTransaction({
    to: AXL_USDC_MOONBEAM,
    data: approveTransactionData,
    value: 0n,
    nonce: params.moonbeamEphemeralStartingNonce,
    gas: BigInt(150000),
    maxFeePerGas,
  });

  const squidrouterSwapTransaction = await moonbeamWalletClient.signTransaction({
    to: transactionRequest.target,
    data: transactionRequest.data,
    value: BigInt(transactionRequest.value),
    gas: BigInt(transactionRequest.gasLimit),
    maxFeePerGas,
    nonce: params.moonbeamEphemeralStartingNonce + 1,
  });

  // Alternative way, untested.
  // const keyring = new Keyring({ type: 'ethereum' });

  // const ephemeralKeypair = keyring.addFromUri(`${params.moonbeamEphemeralSeed}/m/44'/60'/${0}'/${0}/${0}`);

  // const swapEvmCall =  params.moonbeamNode.api.tx.evm.call(params.moonbeamEphemeralAddress, transactionRequest.target, transactionRequest.data,  transactionRequest.value,  transactionRequest.gasLimit, maxFeePerGas, undefined, undefined, undefined);
  // const signedSwapEvmCall = await swapEvmCall.signAsync(ephemeralKeypair, {nonce: params.moonbeamEphemeralStartingNonce + 1});

  // console.log('Swap transaction prepared substrate: ', encodeSubmittableExtrinsic(signedSwapEvmCall));

  return { squidrouterApproveTransaction, squidrouterSwapTransaction };
}
