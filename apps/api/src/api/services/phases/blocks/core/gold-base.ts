import {
  type CreateQuoteRequest,
  EPaymentMethod,
  EvmClientManager,
  EvmToken,
  type EvmTokenDetails,
  evmTokenConfig,
  FiatToken,
  getNetworkFromDestination,
  Networks,
  normalizeTokenSymbol,
  RampDirection,
  RELAY_BASE_USDC_ADDRESS,
  registerEvmToken
} from "@vortexfi/shared";
import Big from "big.js";
import { encodePacked, parseAbi } from "viem";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import { type StockReferencePrice, stockPriceUnavailableError } from "./robinhood-stocks";

type GoldRouteRequest = Pick<CreateQuoteRequest, "from" | "inputCurrency" | "outputCurrency" | "rampType" | "to">;

export const GOLD_TOKEN = "PAXG";
export const BASE_PAXG_DECIMALS = 18;
/** The issuer's own deployment on Base. The symbol only ever means this contract there. */
export const BASE_PAXG_ADDRESS = "0xe904AEA5E1b110c9174728fA2efFc8aeD19E98Ef";

/** Native USDC on Base, the only token Gold is swapped against. */
export const BASE_USDC_ADDRESS = RELAY_BASE_USDC_ADDRESS as `0x${string}`;
export const BASE_USDC_DECIMALS = 6;

/**
 * The one pool Gold swaps through: PancakeSwap v3 USDC/PAXG at 0.05% on Base. Squid cannot route this token there.
 * The router is the v3 `SwapRouter`, whose `exactInput` carries its deadline in the struct.
 */
export const BASE_PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
export const BASE_PANCAKE_V3_QUOTER_V2 = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";
export const BASE_PANCAKE_V3_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
export const BASE_PAXG_USDC_POOL = "0x57Db0333fD91E67ebE9B8B21919024f3a297cc2c";
export const BASE_PAXG_USDC_POOL_FEE = 500;
/** Chainlink PAXG / USD on Base, 8 decimals. The pool's price is only trusted as far as it agrees with this. */
export const BASE_PAXG_USD_FEED = "0xd49c546D32D5472a7F7704EC183128512a1B2fcb";

const CHAINLINK_FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
]);
const CHAINLINK_FEED_DECIMALS = 8;

const baseUsdc = evmTokenConfig[Networks.Base][EvmToken.USDC] as EvmTokenDetails;

/**
 * Registered for this process only, not added to the shared static config: the browser apps build their token
 * pickers from that config, and only the Gold routes below may move this token.
 */
export const BASE_PAXG: EvmTokenDetails = {
  ...baseUsdc,
  assetSymbol: GOLD_TOKEN,
  decimals: BASE_PAXG_DECIMALS,
  erc20AddressSourceChain: BASE_PAXG_ADDRESS
};
registerEvmToken(BASE_PAXG);

/** PAXG on Base is the token bought or sold, whatever pays for it. Only the Gold flows may route such a request. */
export function isGoldBaseRoute(request: GoldRouteRequest): boolean {
  const buy = request.rampType === RampDirection.BUY;
  return (
    getNetworkFromDestination(buy ? request.to : request.from) === Networks.Base &&
    normalizeTokenSymbol(String(buy ? request.outputCurrency : request.inputCurrency)) === GOLD_TOKEN
  );
}

/** Gold against BRL through Pix. */
export function isBrlPixGoldRoute(request: GoldRouteRequest): boolean {
  const buy = request.rampType === RampDirection.BUY;
  return (
    isGoldBaseRoute(request) &&
    (buy ? request.inputCurrency : request.outputCurrency) === FiatToken.BRL &&
    (buy ? request.from : request.to) === EPaymentMethod.PIX
  );
}

/** Gold against native USDC, both ends on Base. */
export function isBaseUsdcGoldRoute(request: GoldRouteRequest): boolean {
  const buy = request.rampType === RampDirection.BUY;
  return (
    isGoldBaseRoute(request) &&
    (buy ? request.from : request.to) === Networks.Base &&
    (buy ? request.inputCurrency : request.outputCurrency) === EvmToken.USDC
  );
}

/** The per-direction switch of the route's payment method. A Gold request on any other rail is never enabled. */
export function isGoldRouteEnabled(request: GoldRouteRequest): boolean {
  if (isBaseUsdcGoldRoute(request)) return config.gold.usdcEnabledDirections.includes(request.rampType);
  if (isBrlPixGoldRoute(request)) return config.gold.enabledDirections.includes(request.rampType);
  return false;
}

/** Single hop between USDC and PAXG through the pinned pool, ordered from input to output. */
export function goldSwapTokens(direction: RampDirection): { inputToken: `0x${string}`; outputToken: `0x${string}` } {
  return direction === RampDirection.BUY
    ? { inputToken: BASE_USDC_ADDRESS, outputToken: BASE_PAXG_ADDRESS }
    : { inputToken: BASE_PAXG_ADDRESS, outputToken: BASE_USDC_ADDRESS };
}

export function goldSwapPath(direction: RampDirection): `0x${string}` {
  const { inputToken, outputToken } = goldSwapTokens(direction);
  return encodePacked(["address", "uint24", "address"], [inputToken, BASE_PAXG_USDC_POOL_FEE, outputToken]);
}

/** The reference a Gold swap's price is checked against. An unreadable feed makes Gold unavailable, like a stock's. */
export async function readGoldReferencePrice(): Promise<StockReferencePrice> {
  try {
    const [, answer, , updatedAt] = await EvmClientManager.getInstance().readContractWithRetry<
      readonly [bigint, bigint, bigint, bigint, bigint]
    >(Networks.Base, { abi: CHAINLINK_FEED_ABI, address: BASE_PAXG_USD_FEED, functionName: "latestRoundData" });
    if (answer <= 0n) {
      throw new Error(`non-positive answer ${answer}`);
    }
    return {
      priceUsd: new Big(answer.toString()).div(new Big(10).pow(CHAINLINK_FEED_DECIMALS)),
      updatedAt: new Date(Number(updatedAt) * 1000)
    };
  } catch (error) {
    logger.warn(`The ${GOLD_TOKEN} price reference is unreadable: ${error instanceof Error ? error.message : error}`);
    throw stockPriceUnavailableError();
  }
}
