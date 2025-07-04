import { Networks } from "@packages/shared";
import { createConfig } from "@wagmi/core";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam } from "viem/chains";
import { EvmClientManager } from "../evm/clientManager";

export const createMoonbeamClientsAndConfig = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
  const evmClientManager = EvmClientManager.getInstance();
  const moonbeamClient = evmClientManager.getClient(Networks.Moonbeam);
  const walletClient = evmClientManager.getWalletClient(Networks.Moonbeam, executorAccount);

  const moonbeamConfig = createConfig({
    chains: [moonbeam],
    transports: {
      [moonbeam.id]: http()
    }
  });

  return { moonbeamClient, moonbeamConfig, walletClient };
};
