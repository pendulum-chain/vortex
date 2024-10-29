import { config } from '../config';

export const HORIZON_URL = 'https://horizon.stellar.org';
//export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const BASE_FEE = '1000000';
export const PENDULUM_WSS = 'wss://rpc-pendulum.prd.pendulumchain.tech';
//export const PENDULUM_WSS = 'ws://localhost:8000';
export const NABLA_ROUTER = '6dQQoUKQ9LNDCrGMjoZjeHBXsuihSgQiQEgD9Z7VtHR82wfG'; // EURC circle instance

export const SPACEWALK_REDEEM_SAFETY_MARGIN = 0.05;
export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const SIGNING_SERVICE_URL =
  config.maybeSignerServiceUrl ||
  (config.isProd
    ? 'https://prototype-signer-service-polygon.pendulumchain.tech'
    : 'https://prototype-signer-service-polygon.pendulumchain.tech'); // TODO rollbcak after testing
