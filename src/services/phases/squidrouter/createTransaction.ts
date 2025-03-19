import { createWalletClient, encodeFunctionData, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { moonbeam } from 'viem/chains';

import { AXL_USDC_MOONBEAM } from '../../../constants/constants';
import { Networks } from '../../../helpers/networks';
import { OnrampOutputTokenType } from '../../onrampingFlow';
import { getRoute, RouteParams } from './route';
import { createOnrampRouteParams } from './route';
import { TransactionRequest } from './route';
import erc20ABI from '../../../contracts/ERC20';

export interface OnrampSquidrouterParams {
  fromAddress: string;
  amount: string;
  outputToken: OnrampOutputTokenType;
  toNetwork: Networks;
  addressDestination: string;
  moonbeamEphemeralSeed: `0x${string}`;
}

export async function createOnrampSquidrouterTransaction(
  params: OnrampSquidrouterParams,
): Promise<{ squidrouterApproveTransaction: string; squidrouterSwapTransaction: string }> {
  const moonbeamWalletClient = createWalletClient({
    account: privateKeyToAccount(params.moonbeamEphemeralSeed),
    chain: moonbeam,
    transport: http(),
  });

  const routeParams = createOnrampRouteParams(
    params.fromAddress,
    params.amount,
    params.outputToken,
    params.toNetwork,
    params.addressDestination,
  );
  const routeResult = await getRoute(routeParams);

  const route = routeResult.data.route;
  const requestId = routeResult.requestId;

  console.log('Calculated onramp route:', route);
  console.log('requestId:', requestId);

  const transactionRequest = route.transactionRequest;

  const approveTransactionData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'approve',
    args: [transactionRequest?.target, params.amount],
  });

  const squidrouterApproveTransaction = await moonbeamWalletClient.signTransaction({
    to: AXL_USDC_MOONBEAM,
    data: approveTransactionData,
    value: 0n,
  });

  const squidrouterSwapTransaction = await moonbeamWalletClient.signTransaction({
    to: transactionRequest.target,
    data: transactionRequest.data,
    value: transactionRequest.value,
    gas: BigInt(transactionRequest.gasLimit) * BigInt(2),
  });

  return { squidrouterApproveTransaction, squidrouterSwapTransaction };
}
