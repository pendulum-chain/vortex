import {
  type CreateQuoteRequest,
  EPaymentMethod,
  EvmToken,
  type EvmTokenDetails,
  evmTokenConfig,
  FiatToken,
  getNetworkFromDestination,
  Networks,
  normalizeTokenSymbol,
  RampDirection,
  registerEvmToken
} from "@vortexfi/shared";
import { config } from "../../../../../config/vars";

type GoldRouteRequest = Pick<CreateQuoteRequest, "from" | "inputCurrency" | "outputCurrency" | "rampType" | "to">;

export const GOLD_TOKEN = "PAXG";
export const BASE_PAXG_DECIMALS = 18;
/** The issuer's own deployment on Base. The symbol only ever means this contract there. */
export const BASE_PAXG_ADDRESS = "0xe904AEA5E1b110c9174728fA2efFc8aeD19E98Ef";

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
