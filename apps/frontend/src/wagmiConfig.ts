import { arbitrum, avalanche, base, bsc, mainnet, polygon, polygonAmoy } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createSmartFallbackTransports } from "@vortexfi/shared";

import { config } from "./config";

const chainRpcConfig = config.alchemyApiKey
  ? {
      [arbitrum.id]: [`https://arb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`, "https://arb1.arbitrum.io/rpc"],
      [avalanche.id]: [
        `https://avax-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`,
        "https://api.avax.network/ext/bc/C/rpc"
      ],
      [base.id]: [`https://base-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`, "https://mainnet.base.org"],
      [bsc.id]: [`https://bnb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`, "https://bsc-dataseed.binance.org"],
      [mainnet.id]: [`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`, "https://eth.llamarpc.com"],
      [polygon.id]: [`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`, "https://polygon-rpc.com"],
      [polygonAmoy.id]: ["https://polygon-amoy.api.onfinality.io/public", "https://rpc-amoy.polygon.technology"]
    }
  : {
      [arbitrum.id]: ["https://arb1.arbitrum.io/rpc"],
      [avalanche.id]: ["https://api.avax.network/ext/bc/C/rpc"],
      [base.id]: ["https://mainnet.base.org"],
      [bsc.id]: ["https://bsc-dataseed.binance.org"],
      [mainnet.id]: ["https://eth.llamarpc.com"],
      [polygon.id]: ["https://polygon-rpc.com"],
      [polygonAmoy.id]: ["https://polygon-amoy.api.onfinality.io/public", "https://rpc-amoy.polygon.technology"]
    };

// Create smart fallback transports with automatic retry and RPC switching
const transports = createSmartFallbackTransports(chainRpcConfig, {
  initialDelayMs: 500,
  timeout: 10_000
});

const metadata = {
  description: "Vortex",
  icons: [],
  name: "Vortex", // origin must match your domain & subdomain
  url: "https://app.vortexfinance.co"
};

const networks = [mainnet, polygon, arbitrum, base, avalanche, bsc, polygonAmoy];

const projectId = "495a5f574d57e27fd65caa26d9ea4f10";
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  transports
});

createAppKit({
  adapters: [wagmiAdapter],
  enableEIP6963: true,
  enableWalletGuide: false,
  // Some wallets are not always shown. We can define them with their ID found [here](https://walletguide.walletconnect.network/)
  featuredWalletIds: [
    "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // metamask
    "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // phantom
    "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1" // rabby
  ],
  features: {
    analytics: false,
    email: false,
    onramp: false,
    socials: false,
    swaps: false
  },
  metadata,
  // @ts-expect-error - networks is not typed
  networks,
  projectId,
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#162456"
  }
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
