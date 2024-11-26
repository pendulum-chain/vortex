import { config } from '../config';

export const HORIZON_URL = 'https://horizon.stellar.org';
export const BASE_FEE = '1000000';
export const PENDULUM_WSS = 'wss://rpc-pendulum.prd.pendulumchain.tech';
export const ASSETHUB_WSS = 'wss://polkadot-asset-hub-rpc.polkadot.io';
export const WALLETCONNECT_ASSETHUB_ID = 'polkadot:68d56f15f85d3136970ec16946040bc1';
export const NABLA_ROUTER = '6dQQoUKQ9LNDCrGMjoZjeHBXsuihSgQiQEgD9Z7VtHR82wfG'; // EURC circle instance

export const SPACEWALK_REDEEM_SAFETY_MARGIN = 0.05;
export const AMM_MINIMUM_OUTPUT_SOFT_MARGIN = 0.02;
export const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;
export const SIGNING_SERVICE_URL =
  config.maybeSignerServiceUrl ||
  (config.isProd ? 'https://prototype-signer-service-polygon.pendulumchain.tech' : 'http://localhost:3000');
