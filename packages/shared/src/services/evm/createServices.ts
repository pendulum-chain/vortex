import { createConfig } from "@wagmi/core";
import { Chain, createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

// @ts-ignore
export function createEvmClientsAndConfig(
  executorAccount: ReturnType<typeof mnemonicToAccount> | ReturnType<typeof privateKeyToAccount>,
  chain: Chain
) {
  const walletClient = createWalletClient({
    account: executorAccount,
    chain,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain,
    transport: http()
  });

  const evmConfig = createConfig({
    chains: [chain],
    transports: {
      [chain.id]: http()
    }
  });

  return { evmConfig, publicClient, walletClient };
}
