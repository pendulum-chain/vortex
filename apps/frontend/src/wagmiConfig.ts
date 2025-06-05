import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arbitrum, avalanche, base, bsc, mainnet, polygon } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';
import { http } from 'wagmi';

import { config } from './config';

// If we have an Alchemy API key, we can use it to fetch data from Polygon, otherwise use the default endpoint
const transports = config.alchemyApiKey
  ? {
      [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [avalanche.id]: http(`https://avax-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [bsc.id]: http(`https://bnb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [polygon.id]: http(`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
    }
  : {
      [arbitrum.id]: http(''),
      [avalanche.id]: http(''),
      [base.id]: http(''),
      [bsc.id]: http(''),
      [mainnet.id]: http(''),
      [polygon.id]: http(''),
    };

const metadata = {
  name: 'Vortex',
  description: 'Vortex',
  url: 'https://app.vortexfinance.co', // origin must match your domain & subdomain
  icons: [],
};

const networks = [mainnet, polygon, arbitrum, base, avalanche, bsc];

const projectId = '495a5f574d57e27fd65caa26d9ea4f10';
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  transports,
});

createAppKit({
  adapters: [wagmiAdapter],
  // @ts-expect-error - networks is not typed
  networks,
  projectId,
  features: {
    email: false,
    analytics: false,
    onramp: false,
    socials: false,
    swaps: false,
  },
  // Some wallets are not always shown. We can define them with their ID found [here](https://walletguide.walletconnect.network/)
  featuredWalletIds: [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // metamask
    'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // phantom
    '18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1', // rabby
  ],
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#162456',
  },
  enableWalletGuide: false,
  enableEIP6963: true,
  metadata,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
