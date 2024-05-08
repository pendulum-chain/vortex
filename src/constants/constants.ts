import { config } from "../config";

export const HORIZON_URL = 'https://horizon.stellar.org';
//export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const BASE_FEE = '1000000';
export const PENDULUM_WSS = 'wss://rpc-pendulum.prd.pendulumchain.tech';
//export const PENDULUM_WSS = 'ws://localhost:8000';

export const SIGNING_SERVICE_URL = config.isProd ? 'https://prototype-signer-service.pendulumchain.tech' : 'http://localhost:3000';
