import { waitForTransactionReceipt } from '@wagmi/core';
import { Config } from 'wagmi';

export async function waitForEvmTransaction(hash: `0x${string}`, wagmiConfig: Config) {
  const result = await waitForTransactionReceipt(wagmiConfig, { hash });
}
