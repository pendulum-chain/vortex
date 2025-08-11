/**
 * Miscellaneous constants for token configuration
 */

export const HORIZON_URL = "https://horizon.stellar.org";
export const STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS = "2.5"; // Amount to send to the new stellar ephemeral account created
export const PENDULUM_WSS = "wss://rpc-pendulum.prd.pendulumchain.tech";
export const ASSETHUB_WSS = "wss://polkadot-asset-hub-rpc.polkadot.io";
export const MOONBEAM_WSS = "wss://wss.api.moonbeam.network";
export const WALLETCONNECT_ASSETHUB_ID = "polkadot:68d56f15f85d3136970ec16946040bc1";
export const NABLA_ROUTER = "6gAVVw13mQgzzKk4yEwScMmWiCNyMAunXFJUZonbgKrym81N"; // AssetHub USDC instance

export const SPACEWALK_REDEEM_SAFETY_MARGIN = 0.05;
export const AMM_MINIMUM_OUTPUT_SOFT_MARGIN = 0.02;
export const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;

// Constants relevant for the Monerium ramps
export const ERC20_EURE_POLYGON: `0x${string}` = "0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6"; // EUR.e on Polygon
export const ERC20_EURE_POLYGON_DECIMALS = 18; // EUR.e on Polygon has 18 decimals
