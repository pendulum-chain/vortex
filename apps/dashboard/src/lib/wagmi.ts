import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { arbitrum, base, mainnet, polygon } from "wagmi/chains";

// Placeholder id keeps the ConnectKit modal rendering in dev. Drop a real id from
// cloud.reown.com into VITE_WALLETCONNECT_PROJECT_ID to enable actual connections.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "vortex-dashboard-placeholder";

// EVM chains only — AssetHub (Polkadot) is intentionally out of scope for the connect button.
export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Vortex Dashboard",
    chains: [polygon, arbitrum, base, mainnet],
    transports: {
      [arbitrum.id]: http(),
      [base.id]: http(),
      [mainnet.id]: http(),
      [polygon.id]: http()
    },
    walletConnectProjectId
  })
);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
