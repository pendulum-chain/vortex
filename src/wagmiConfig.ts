import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, safeWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { polygon } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';
import { config } from './config';

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

// If we have an Alchemy API key, we can use it to fetch data from Polygon, otherwise use the default endpoint
const transports = config.alchemyApiKey
  ? {
      [polygon.id]: http(`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
    }
  : {
      [polygon.id]: http(''),
    };

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors,
  ssr: false,
  transports,
});
