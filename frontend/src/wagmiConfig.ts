import { arbitrum, avalanche, base, bsc, mainnet, polygon, solana } from '@reown/appkit/networks';
import { http } from 'wagmi';
import { config } from './config';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

// If we have an Alchemy API key, we can use it to fetch data from Polygon, otherwise use the default endpoint
const wagmiTransports = config.alchemyApiKey
  ? {
      [polygon.id]: http(`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [bsc.id]: http(`https://bnb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
      [avalanche.id]: http(`https://avax-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
    }
  : {
      [polygon.id]: http(''),
      [mainnet.id]: http(''),
      [bsc.id]: http(''),
      [arbitrum.id]: http(''),
      [base.id]: http(''),
      [avalanche.id]: http(''),
    };

// 2. Create a metadata object - optional
const metadata = {
  name: 'Vortex',
  description: 'Vortex',
  url: 'https://app.vortexfinance.co', // origin must match your domain & subdomain
  icons: [],
};

// 3. Set the networks
const networks = [mainnet, polygon, bsc, arbitrum, base, avalanche, solana];

const projectId = '495a5f574d57e27fd65caa26d9ea4f10';

// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  transports: wagmiTransports,
});

const solanaAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
});

// 5. Create modal
createAppKit({
  // @ts-ignore
  adapters: [wagmiAdapter, solanaAdapter],
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
  metadata,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
