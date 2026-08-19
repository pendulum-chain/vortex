import { bsc } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "wagmi";

export const bscNetwork = bsc;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

if (!projectId) {
  throw new Error("VITE_WALLETCONNECT_PROJECT_ID is required");
}

const networks: [typeof bsc] = [bsc];
const bscRpcUrl = import.meta.env.VITE_BSC_RPC_URL?.trim();
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  transports: {
    [bsc.id]: bscRpcUrl ? http(bscRpcUrl) : http()
  }
});

createAppKit({
  adapters: [wagmiAdapter],
  enableEIP6963: true,
  enableWalletGuide: false,
  features: {
    analytics: false,
    email: false,
    onramp: false,
    socials: false,
    swaps: false
  },
  metadata: {
    description: "BSC wallet demo for Vortex",
    icons: [],
    name: "Vortex Demo",
    url: window.location.origin
  },
  networks,
  projectId,
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#143f38"
  }
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
