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

export type Environment = 'development' | 'staging' | 'production';
const nodeEnv = process.env.NODE_ENV as Environment;
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv) as Environment;

export const config = {
  nodeEnv,
  env,
  isProd: env === 'production',
  isDev: env === 'development',
  defaultPage: '/pendulum/dashboard',
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
  swap: {
    defaults: {
      slippage: 0.5,
      deadline: 30,
    },
  },
  backstop: {
    defaults: {
      slippage: 0.1,
    },
    securityFee: 0.01, // 1%
  },
  transaction: {
    settings: {
      slippage: {
        min: 0.1,
        max: 99.9,
      },
      deadline: {
        min: 1,
        max: 1440, // 1 day
      },
    },
  },
  walletConnect: {
    url: 'wss://relay.walletconnect.com',
    projectId: '299fda67fbf3b60a31ba8695524534cd',
  },
  alchemyPay: {
    prodUrl: `https://ramp.alchemypay.org/?appId=wNxCyQNce01WLqyL&network=PEN&crypto=PENDULUM&showTable=buy&type=buy`,
    testUrl: `https://ramptest.alchemypay.org/?appId=f83Is2y7L425rxl8&network=PEN&crypto=PENDULUM&showTable=buy&type=buy`,
    encodeUrlWithRedirection: (sourceUrl: string, redirectUrl: string) => {
      return sourceUrl + '&redirectURL=' + encodeURI(redirectUrl);
    },
  },
};