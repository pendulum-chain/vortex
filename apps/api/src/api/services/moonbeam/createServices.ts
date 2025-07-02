import { createConfig } from "@wagmi/core";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam } from "viem/chains";
import { EvmClientManager } from "../evm/clientManager";

export const createMoonbeamClientsAndConfig = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient("moonbeam");
  const walletClient = evmClientManager.getWalletClient("moonbeam", executorAccount);

  const moonbeamConfig = createConfig({
    chains: [moonbeam],
    transports: {
      [moonbeam.id]: http()
    }
  });

  return { moonbeamConfig, publicClient, walletClient };
};
