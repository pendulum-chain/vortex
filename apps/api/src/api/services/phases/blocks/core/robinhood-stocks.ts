import {
  type CreateQuoteRequest,
  EPaymentMethod,
  EvmClientManager,
  EvmToken,
  FiatToken,
  Networks,
  QuoteError,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { parseAbi } from "viem";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import { APIError } from "../../../../errors/api-error";

export type StockSymbol =
  | EvmToken.AAPL
  | EvmToken.AMZN
  | EvmToken.GOOGL
  | EvmToken.META
  | EvmToken.MSFT
  | EvmToken.MU
  | EvmToken.NVDA
  | EvmToken.QQQ
  | EvmToken.SGOV
  | EvmToken.SPCX
  | EvmToken.SPY
  | EvmToken.TSLA;

interface StockPin {
  address: `0x${string}`;
  chainlinkFeed: `0x${string}`;
  uniswapFee: number;
  uniswapPool: `0x${string}`;
}

/** The corridor's allowlist: a symbol only ever means this contract, its USDG pool and its price feed. */
export const ROBINHOOD_STOCKS: Record<StockSymbol, StockPin> = {
  AAPL: {
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    chainlinkFeed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    uniswapFee: 500,
    uniswapPool: "0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d"
  },
  AMZN: {
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    chainlinkFeed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    uniswapFee: 3000,
    uniswapPool: "0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef"
  },
  GOOGL: {
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    chainlinkFeed: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
    uniswapFee: 500,
    uniswapPool: "0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7"
  },
  META: {
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    chainlinkFeed: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
    uniswapFee: 3000,
    uniswapPool: "0x107a7cb40d8665360ba10e59471af06150a50922"
  },
  MSFT: {
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    chainlinkFeed: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E",
    uniswapFee: 3000,
    uniswapPool: "0xeb60bcd1d920ad6e102690ccfc6fb488899e1510"
  },
  MU: {
    address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
    chainlinkFeed: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596",
    uniswapFee: 3000,
    uniswapPool: "0xd057b1bc54917855bbee58ead58647f47cab35e5"
  },
  NVDA: {
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    chainlinkFeed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    uniswapFee: 500,
    uniswapPool: "0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3"
  },
  QQQ: {
    address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68",
    chainlinkFeed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae",
    uniswapFee: 500,
    uniswapPool: "0xd60a5d14db690b7afad71f76b108071d7175597d"
  },
  SGOV: {
    address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5",
    chainlinkFeed: "0xa0DF4ee0fFf975306345875E3548Fcc519577A11",
    uniswapFee: 500,
    uniswapPool: "0x6ba50150b17ffd0972915aaf04ffd5e8f4fa49b4"
  },
  SPCX: {
    address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    chainlinkFeed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
    uniswapFee: 500,
    uniswapPool: "0xc61284332117c3fb23a2a56cceffd07f7af60029"
  },
  SPY: {
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    chainlinkFeed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
    uniswapFee: 500,
    uniswapPool: "0xa7bb1ac63bbab0c44316e6c8c455213441689167"
  },
  TSLA: {
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    chainlinkFeed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    uniswapFee: 3000,
    uniswapPool: "0xf4acdaeeb7022862a763c9b1b885e11191c889e3"
  }
};

export const STOCK_TOKEN_DECIMALS = 18;
export const ROBINHOOD_USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const ROBINHOOD_UNISWAP_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
export const ROBINHOOD_UNISWAP_QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
export const ROBINHOOD_UNISWAP_SWAP_ROUTER_02 = "0xcaf681a66d020601342297493863e78c959e5cb2";

const STOCK_FLAGS_ABI = parseAbi(["function paused() view returns (bool)", "function oraclePaused() view returns (bool)"]);
const CHAINLINK_FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
]);
const CHAINLINK_FEED_DECIMALS = 8;

export interface StockReferencePrice {
  priceUsd: Big;
  updatedAt: Date;
}

export function isRobinhoodRoute(request: Pick<CreateQuoteRequest, "from" | "rampType" | "to">): boolean {
  return (request.rampType === RampDirection.BUY ? request.to : request.from) === Networks.Robinhood;
}

/** The one corridor Robinhood Chain serves. Any other request falls through to the catalog's own rejection. */
export function isBrlPixRobinhoodRoute(
  request: Pick<CreateQuoteRequest, "from" | "inputCurrency" | "outputCurrency" | "rampType" | "to">
): boolean {
  const isBuy = request.rampType === RampDirection.BUY;
  return (
    isRobinhoodRoute(request) &&
    (isBuy ? request.inputCurrency : request.outputCurrency) === FiatToken.BRL &&
    (isBuy ? request.from : request.to) === EPaymentMethod.PIX
  );
}

/** The only crypto-funded corridor: native USDC on Base against pinned stock tokens. */
export function isBaseUsdcRobinhoodRoute(
  request: Pick<CreateQuoteRequest, "from" | "inputCurrency" | "outputCurrency" | "rampType" | "to">
): boolean {
  const buy = request.rampType === RampDirection.BUY;
  return (
    isRobinhoodRoute(request) &&
    (buy ? request.from : request.to) === Networks.Base &&
    (buy ? request.inputCurrency : request.outputCurrency) === EvmToken.USDC
  );
}

export function isStockSymbol(symbol: unknown): symbol is StockSymbol {
  return typeof symbol === "string" && Object.hasOwn(ROBINHOOD_STOCKS, symbol);
}

function stockTradingPausedError(): APIError {
  return new APIError({ isPublic: true, message: QuoteError.StockTradingPaused, status: httpStatus.SERVICE_UNAVAILABLE });
}

export function stockPriceUnavailableError(): APIError {
  return new APIError({ isPublic: true, message: QuoteError.StockPriceUnavailable, status: httpStatus.SERVICE_UNAVAILABLE });
}

/** The public 503s a stock quote can end in. Generic error mapping must let these through. */
export function isStockQuoteUnavailableError(error: unknown): error is APIError {
  return (
    error instanceof APIError &&
    error.status === httpStatus.SERVICE_UNAVAILABLE &&
    [
      QuoteError.StockTradingPaused,
      QuoteError.StockPriceUnavailable,
      QuoteError.StockDexSubsidyUnavailable,
      QuoteError.StockUsdcFundingUnavailable
    ].includes(error.message as QuoteError)
  );
}

/** Either issuer flag set, or a failed read, counts as paused. */
export async function readStockFlags(symbol: StockSymbol): Promise<{ paused: boolean }> {
  const address = ROBINHOOD_STOCKS[symbol].address;
  const client = EvmClientManager.getInstance();
  try {
    const flags = await Promise.all(
      (["paused", "oraclePaused"] as const).map(functionName =>
        client.readContractWithRetry<boolean>(Networks.Robinhood, { abi: STOCK_FLAGS_ABI, address, functionName })
      )
    );
    return { paused: flags.some(flag => flag !== false) };
  } catch (error) {
    logger.warn(
      `Treating ${symbol} as paused, its issuer flags are unreadable: ${error instanceof Error ? error.message : error}`
    );
    return { paused: true };
  }
}

export async function assertStockTradable(symbol: StockSymbol): Promise<void> {
  const { paused } = await readStockFlags(symbol);
  if (paused) {
    throw stockTradingPausedError();
  }
}

export async function readStockReferencePrice(symbol: StockSymbol): Promise<StockReferencePrice> {
  try {
    const [, answer, , updatedAt] = await EvmClientManager.getInstance().readContractWithRetry<
      readonly [bigint, bigint, bigint, bigint, bigint]
    >(Networks.Robinhood, {
      abi: CHAINLINK_FEED_ABI,
      address: ROBINHOOD_STOCKS[symbol].chainlinkFeed,
      functionName: "latestRoundData"
    });
    if (answer <= 0n) {
      throw new Error(`non-positive answer ${answer}`);
    }
    return {
      priceUsd: new Big(answer.toString()).div(new Big(10).pow(CHAINLINK_FEED_DECIMALS)),
      updatedAt: new Date(Number(updatedAt) * 1000)
    };
  } catch (error) {
    logger.warn(`The ${symbol} price reference is unreadable: ${error instanceof Error ? error.message : error}`);
    throw stockPriceUnavailableError();
  }
}

function assertStockReferenceFresh(reference: StockReferencePrice, now: Date): void {
  const maxAgeMs = config.stocks.priceReferenceMaxAgeHours * 60 * 60 * 1000;
  if (now.getTime() - reference.updatedAt.getTime() > maxAgeMs) {
    throw stockPriceUnavailableError();
  }
}

export async function readFreshStockPriceUsd(symbol: StockSymbol, now = new Date()): Promise<Big> {
  const reference = await readStockReferencePrice(symbol);
  assertStockReferenceFresh(reference, now);
  return reference.priceUsd;
}

/**
 * Fails closed when the reference is stale or the execution price is worse for the user than the
 * configured deviation: higher than the reference on a buy, lower on a sell.
 * @returns How far the execution price is worse for the user, negative when it is better.
 */
export function assertStockPriceWithinGuard(params: {
  direction: RampDirection;
  executionPriceUsd: Big;
  now?: Date;
  reference: StockReferencePrice;
}): { deviationBps: number } {
  const { direction, executionPriceUsd, now = new Date(), reference } = params;
  assertStockReferenceFresh(reference, now);

  const adverseUsd =
    direction === RampDirection.BUY ? executionPriceUsd.minus(reference.priceUsd) : reference.priceUsd.minus(executionPriceUsd);
  const deviationBps = adverseUsd.div(reference.priceUsd).mul(10_000);
  if (deviationBps.gt(config.stocks.maxPriceDeviationBps)) {
    throw stockPriceUnavailableError();
  }
  return { deviationBps: Number(deviationBps.toFixed(2)) };
}
