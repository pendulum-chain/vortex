import { createConfig } from "@wagmi/core";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam } from "viem/chains";

export const createMoonbeamClientsAndConfig = (executorAccount: ReturnType<typeof privateKeyToAccount>) => {
  const walletClient = createWalletClient({
    account: executorAccount,
    chain: moonbeam,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain: moonbeam,
    transport: http()
  });

  const moonbeamConfig = createConfig({
    chains: [moonbeam],
    transports: {
      [moonbeam.id]: http()
    }
  });

  return { moonbeamConfig, publicClient, walletClient };
};
