import { createPublicClient, createWalletClient, http } from "viem";
import { moonbeam } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createConfig } from "@wagmi/core";

export const createMoonbeamClientsAndConfig = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
    const walletClient = createWalletClient({
      account: executorAccount,
      chain: moonbeam,
      transport: http(),
    });
  
    const publicClient = createPublicClient({
      chain: moonbeam,
      transport: http(),
    });

    const moonbeamConfig = createConfig({
      chains: [moonbeam],
      transports: {
        [moonbeam.id]: http(),
      },
    });
  
    return { walletClient, publicClient, moonbeamConfig };
  };
  