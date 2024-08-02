import { TenantName } from '../models/Tenant';
import { ThemeName } from '../models/Theme';

type TenantConfig = Record<
  TenantName,
  {
    name: string;
    rpc: string;
    theme: ThemeName;
    explorer: string;
  }
>;

type Environment = 'development' | 'staging' | 'production';
const nodeEnv = process.env.NODE_ENV as Environment;
const maybeSignerServiceUrl = import.meta.env.VITE_SIGNING_SERVICE_URL;
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv) as Environment;

export const config = {
  nodeEnv,
  env,
  isProd: env === 'production',
  isDev: env === 'development',
  maybeSignerServiceUrl,
  alchemyApiKey,
  defaultPage: '/pendulum/dashboard',
  spreadsheet: {
    googleCredentials: {
      email: import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: import.meta.env.VITE_GOOGLE_PRIVATE_KEY?.split(String.raw`\n`).join('\n'),
    },
    sheetId: import.meta.env.VITE_GOOGLE_SPREADSHEET_ID,
    // Only used in unit tests
    testSheetId: import.meta.env.VITE_GOOGLE_TEST_SPREADSHEET_ID,
  },
  tenants: {
    [TenantName.Amplitude]: {
      name: 'Amplitude',
      rpc: 'wss://rpc-amplitude.pendulumchain.tech',
      theme: ThemeName.Amplitude,
      explorer: 'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc-foucoco.pendulumchain.tech#/explorer/query',
    },
    [TenantName.Pendulum]: {
      name: 'Pendulum',
      rpc: 'wss://rpc-pendulum.prd.pendulumchain.tech',
      theme: ThemeName.Pendulum,
      explorer: 'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc-foucoco.pendulumchain.tech#/explorer/query',
    },
    [TenantName.Foucoco]: {
      name: 'Foucoco',
      rpc: 'wss://rpc-foucoco.pendulumchain.tech',
      theme: ThemeName.Amplitude,
      explorer: 'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc-foucoco.pendulumchain.tech#/explorer/query',
    },
    [TenantName.Local]: {
      name: 'Local',
      rpc: 'ws://localhost:9944',
      theme: ThemeName.Amplitude,
      explorer: 'https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc-foucoco.pendulumchain.tech#/explorer/query',
    },
  } satisfies TenantConfig,
  xcm: { fees: '0.016' },
  swap: {
    axelarSlippageBasisPoints: 10, // allow for some extra buffer due to USDC -> axlUSDC risk
    slippageBasisPoints: 30,
    deadline: 30,
  },
  walletConnect: {
    url: 'wss://relay.walletconnect.com',
    projectId: '299fda67fbf3b60a31ba8695524534cd',
  },
  test: {
    mockSep24: false,
    overwriteMinimumTransferAmount: false,
  },
};
