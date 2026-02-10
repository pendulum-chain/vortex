/**
 * Miscellaneous constants for token configuration
 */

export const HORIZON_URL = "https://horizon.stellar.org";
export const STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS = "2.5"; // Amount to send to the new stellar ephemeral account created
export const PENDULUM_WSS = "wss://rpc-pendulum.prd.pendulumchain.tech";
export const ASSETHUB_WSS = "wss://dot-rpc.stakeworld.io/assethub";
export const MOONBEAM_WSS = "wss://wss.api.moonbeam.network";
export const WALLETCONNECT_ASSETHUB_ID = "polkadot:68d56f15f85d3136970ec16946040bc1";
export const NABLA_ROUTER = "6gAVVw13mQgzzKk4yEwScMmWiCNyMAunXFJUZonbgKrym81N"; // AssetHub USDC instance

export const SPACEWALK_REDEEM_SAFETY_MARGIN = 0.05;
export const AMM_MINIMUM_OUTPUT_SOFT_MARGIN = 0.02;
export const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;

// Constants relevant for the Monerium ramps
export const ERC20_EURE_POLYGON_V1: `0x${string}` = "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6"; // EUR.e on Polygon
export const ERC20_USDC_POLYGON: `0x${string}` = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"; // USDC on Polygon
// We are currently using both V1 and V2 addresses for EUR.e on Polygon, as Squidrouter uses V1 (presumably, due to pools).
// V2 is used for the permit - transferFrom flow.
// The token balances are synced between both contracts.
export const ERC20_EURE_POLYGON_V2: `0x${string}` = "0xE0aEa583266584DafBB3f9C3211d5588c73fEa8d"; // EUR.e on Polygon V2
export const ERC20_EURE_POLYGON_TOKEN_NAME = `Monerium EURe`;
export const ERC20_EURE_POLYGON_DECIMALS = 18; // EUR.e on Polygon has 18 decimals

export const ERC20_USDC_POLYGON_DECIMALS = 6; // USDC on Polygon has 6 decimals
export const ERC20_USDT_POLYGON_DECIMALS = 6; // USDT on Polygon has 6 decimals
