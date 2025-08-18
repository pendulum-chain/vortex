import { config } from "../config";

export const PENDULUM_WSS = "wss://rpc-pendulum.prd.pendulumchain.tech";
export const ASSETHUB_WSS = "wss://polkadot-asset-hub-rpc.polkadot.io";
export const MOONBEAM_WSS = "wss://moonbeam-rpc.n.dwellir.com";
export const WALLETCONNECT_ASSETHUB_ID = "polkadot:68d56f15f85d3136970ec16946040bc1";

export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;
export const SIGNING_SERVICE_URL =
  config.maybeSignerServiceUrl || (config.isProd ? "/api/production" : "http://localhost:3000");
