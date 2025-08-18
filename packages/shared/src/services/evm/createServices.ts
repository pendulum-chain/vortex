import { MOONBEAM_WSS } from "@packages/shared";
import { createConfig } from "@wagmi/core";
import { Chain, createPublicClient, createWalletClient, http, webSocket } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

// @ts-ignore
export function createEvmClientsAndConfig(
  executorAccount: ReturnType<typeof mnemonicToAccount> | ReturnType<typeof privateKeyToAccount>,
  chain: Chain
) {
  const transport = chain.name === "moonbeam" ? webSocket(MOONBEAM_WSS) : http();
  const walletClient = createWalletClient({
    account: executorAccount,
    chain,
    transport
  });

  const publicClient = createPublicClient({
    chain,
    transport
  });

  const evmConfig = createConfig({
    chains: [chain],
    transports: {
      [chain.id]: transport
    }
  });

  return { evmConfig, publicClient, walletClient };
}
