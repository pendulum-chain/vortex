import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { moonbeam } from 'viem/chains';
import { Networks } from '../../../helpers/networks';
import { getRoute } from './route';
import erc20ABI from '../../../../contracts/ERC20';
import { AXL_USDC_MOONBEAM, EvmToken, OnChainToken } from '../../../../config/tokens';

export interface OfframpSquidrouterParams {
  fromAddress: string;
  amount: string;
  outputToken: OnChainToken;
  toNetwork: Networks;
  addressDestination: string;
}

export async function createOfframpSquidrouterTransactions(
  params: OfframpSquidrouterParams,
): Promise<{ squidrouterApproveTransaction: string; squidrouterSwapTransaction: string }> {
  if (params.toNetwork === Networks.AssetHub) {
    throw new Error('AssetHub is not supported for Squidrouter offramp');
  }

  // TODO - Implement creation of unsigned transactions for Squidrouter offramp
  const squidrouterApproveTransaction = '';
  const squidrouterSwapTransaction = '';

  return { squidrouterApproveTransaction, squidrouterSwapTransaction };
}
