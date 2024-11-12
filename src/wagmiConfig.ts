import { polygon } from '@reown/appkit/networks';
import { createConfig, http } from 'wagmi';
import { config } from './config';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';

// If we have an Alchemy API key, we can use it to fetch data from Polygon, otherwise use the default endpoint
const transports = config.alchemyApiKey
  ? {
      [polygon.id]: http(`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
    }
  : {
      [polygon.id]: http(''),
    };

// 2. Create a metadata object - optional
const metadata = {
  name: 'Vortex',
  description: 'Vortex',
  url: 'https://app.vortexfinance.co', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
};

// 3. Set the networks
const networks = [polygon];

const projectId = '495a5f574d57e27fd65caa26d9ea4f10';
// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});

// 5. Create modal
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  features: {
    email: false,
    analytics: false,
    onramp: false,
    socials: false,
    swaps: false,
  },
  featuredWalletIds: ['c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96'], // metamask
  metadata: undefined, // Optional
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
