import { connectorsForWallets, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { injectedWallet, safeWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { polygon } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';
import { createClient } from 'viem';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [injectedWallet, safeWallet, walletConnectWallet],
    },
  ],
  {
    appName: 'Vortex',
    projectId: '495a5f574d57e27fd65caa26d9ea4f10',
  },
);

const defaultConfig = getDefaultConfig({
  appName: 'Vortex',
  projectId: '495a5f574d57e27fd65caa26d9ea4f10',
  chains: [polygon],
  ssr: false, // If your dApp uses server side rendering (SSR)
});

export const wagmiConfig = createConfig({
  client({ chain }) {
    return createClient({
      chain,
      transport: http(),
    });
  },
  chains: defaultConfig.chains,
  connectors,
  ssr: false,
});
