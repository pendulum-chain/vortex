import { http, createConfig } from '@wagmi/core';
import { moonbeam } from '@wagmi/core/chains';

import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { squidReceiverABI } from '../../contracts/SquidReceiver';
import { squidRouterConfigBase } from '../services/transactions/squidrouter/config';

export const moonbeamConfig = createConfig({
  chains: [moonbeam],
  transports: {
    [moonbeam.id]: http(),
  },
});

export async function isHashRegistered(hash: `0x${string}`): Promise<boolean> {
  const result = (await readContract(moonbeamConfig, {
    abi: squidReceiverABI,
    chainId: moonbeam.id,
    address: squidRouterConfigBase.receivingContractAddress,
    functionName: 'xcmDataMapping',
    args: [hash],
  })) as bigint;

  return result > 0n;
}
