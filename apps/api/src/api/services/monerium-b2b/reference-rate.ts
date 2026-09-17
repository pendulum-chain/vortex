import { formatUnits, parseUnits } from "viem";

/**
 * Partner reference rate for the forwarder fee bands (docs/adr-0005-monerium-b2b-onramp.md, P12):
 * a volume-weighted average price over the last five minutes of Coinbase Exchange
 * EURC-USDC one-minute candles, computed fresh before every swap and recorded on the
 * execution row (rate, window, time) so the partner can recompute it from Coinbase's
 * public candle history. Averaging instead of taking the last tick keeps a single thin
 * print — common on weekends and outside business hours — from becoming the reference.
 * When the five-minute window carries no volume the window widens to an hour; with no
 * volume in an hour there is no reference and the keeper defers. The keeper passes the
 * rate into swapAndForward; the contract rejects it outside its Chainlink band.
 */

/**
 * The Coinbase Exchange product the reference is read from. EURC-USD and EURC-EUR were
 * delisted on 2024-08-29 and still answer the candles endpoint with two-year-old data,
 * so the product's status is monitored (`fetchCoinbaseProductStatus`), not assumed.
 */
export const COINBASE_REFERENCE_PRODUCT = "EURC-USDC";
export const COINBASE_EURC_PRODUCT_URL = `https://api.exchange.coinbase.com/products/${COINBASE_REFERENCE_PRODUCT}`;
export const COINBASE_EURC_CANDLES_URL = `${COINBASE_EURC_PRODUCT_URL}/candles`;
export const COINBASE_REFERENCE_SOURCE = `coinbase-exchange:${COINBASE_REFERENCE_PRODUCT}:vwap`;
export const REFERENCE_WINDOW_SECONDS = 5 * 60;
export const REFERENCE_FALLBACK_WINDOW_SECONDS = 60 * 60;
const CANDLE_GRANULARITY_SECONDS = 60;
const FETCH_TIMEOUT_MS = 5_000;
/** Coinbase candle volumes carry up to eight decimals. */
const VOLUME_DECIMALS = 8;

/** One Coinbase candle: bucket start (unix seconds), low, high, open, close, volume. */
export type Candle = readonly [number, number, number, number, number, number];

export interface ReferenceQuote {
  /** The reference as a decimal string at the oracle's decimals, e.g. "1.14320000". */
  price: string;
  /** The reference scaled to the forwarder's ORACLE_DECIMALS. */
  rateRaw: bigint;
  source: string;
  /** When the reference was computed; the window ends at the current minute bucket. */
  time: Date;
  /** Length of the averaging window that produced the rate (300, or 3600 when widened). */
  windowSeconds: number;
}

/** Mirrors VortexForwarder._checkedReference: |reference - oracle| <= oracle x band / 10000. */
export function isWithinReferenceBand(rateRaw: bigint, oracleRaw: bigint, bandBps: number): boolean {
  const tolerance = (oracleRaw * BigInt(bandBps)) / 10_000n;
  return rateRaw + tolerance >= oracleRaw && rateRaw <= oracleRaw + tolerance;
}

function toRaw(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`candle value is not a non-negative number: ${String(value)}`);
  }
  return parseUnits(value.toFixed(decimals), decimals);
}

/**
 * Volume-weighted average over the candles whose bucket starts inside
 * [windowEnd - windowSeconds, windowEnd), weighting each candle's typical price
 * (low + high + close) / 3 by its volume. Null when the window holds no volume.
 */
export function computeWindowVwap(
  candles: readonly Candle[],
  windowEndSec: number,
  windowSeconds: number,
  decimals: number
): bigint | null {
  let weighted = 0n;
  let volume = 0n;
  for (const [time, low, high, , close, size] of candles) {
    if (time < windowEndSec - windowSeconds || time >= windowEndSec) continue;
    const typical = (toRaw(low, decimals) + toRaw(high, decimals) + toRaw(close, decimals)) / 3n;
    const sizeRaw = toRaw(size, VOLUME_DECIMALS);
    weighted += typical * sizeRaw;
    volume += sizeRaw;
  }
  return volume === 0n ? null : weighted / volume;
}

/** The primary window, or the widened one when the primary carries no volume; null when neither does. */
export function selectReferenceWindow(
  candles: readonly Candle[],
  windowEndSec: number,
  decimals: number
): { rateRaw: bigint; windowSeconds: number } | null {
  for (const windowSeconds of [REFERENCE_WINDOW_SECONDS, REFERENCE_FALLBACK_WINDOW_SECONDS]) {
    const rateRaw = computeWindowVwap(candles, windowEndSec, windowSeconds, decimals);
    if (rateRaw !== null && rateRaw > 0n) {
      return { rateRaw, windowSeconds };
    }
  }
  return null;
}

export function parseCandles(body: unknown): Candle[] {
  if (!Array.isArray(body)) {
    throw new Error("Coinbase candles response is not an array");
  }
  return body.map(row => {
    if (!Array.isArray(row) || row.length < 6 || !row.slice(0, 6).every(v => typeof v === "number" && Number.isFinite(v))) {
      throw new Error("Coinbase candle row is malformed");
    }
    return row.slice(0, 6) as unknown as Candle;
  });
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches the last hour of one-minute candles and computes the reference. Any failure throws; the caller defers. */
export async function fetchCoinbaseReference(
  decimals: number,
  fetchImpl: FetchLike = fetch,
  nowMs: number = Date.now()
): Promise<ReferenceQuote> {
  // The window ends at the end of the current minute bucket, so the in-progress candle counts.
  const windowEndSec =
    Math.floor(nowMs / 1000 / CANDLE_GRANULARITY_SECONDS) * CANDLE_GRANULARITY_SECONDS + CANDLE_GRANULARITY_SECONDS;
  const startSec = windowEndSec - REFERENCE_FALLBACK_WINDOW_SECONDS;
  const url =
    `${COINBASE_EURC_CANDLES_URL}?granularity=${CANDLE_GRANULARITY_SECONDS}` +
    `&start=${new Date(startSec * 1000).toISOString()}&end=${new Date(nowMs).toISOString()}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Coinbase candles responded ${response.status}`);
  }
  const window = selectReferenceWindow(parseCandles(await response.json()), windowEndSec, decimals);
  if (!window) {
    throw new Error(
      `no ${COINBASE_REFERENCE_PRODUCT} volume on Coinbase in the last ${REFERENCE_FALLBACK_WINDOW_SECONDS / 60} minutes`
    );
  }
  return {
    price: formatUnits(window.rateRaw, decimals),
    rateRaw: window.rateRaw,
    source: COINBASE_REFERENCE_SOURCE,
    time: new Date(nowMs),
    windowSeconds: window.windowSeconds
  };
}

// ------------------------------------------------------------------ venue status

export interface CoinbaseProductStatus {
  status: string;
  tradingDisabled: boolean;
}

/** Why the reference product cannot serve as the venue right now, or null when it can. */
export function classifyReferenceVenue(product: CoinbaseProductStatus): string | null {
  if (product.status !== "online") {
    return `Coinbase product ${COINBASE_REFERENCE_PRODUCT} is ${product.status}`;
  }
  if (product.tradingDisabled) {
    return `Coinbase product ${COINBASE_REFERENCE_PRODUCT} has trading disabled`;
  }
  return null;
}

/** Live status of the reference product. Any failure throws; the monitor reports it. */
export async function fetchCoinbaseProductStatus(fetchImpl: FetchLike = fetch): Promise<CoinbaseProductStatus> {
  const response = await fetchImpl(COINBASE_EURC_PRODUCT_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Coinbase product responded ${response.status}`);
  }
  const body = (await response.json()) as { status?: unknown; trading_disabled?: unknown } | null;
  if (typeof body?.status !== "string" || typeof body.trading_disabled !== "boolean") {
    throw new Error("Coinbase product response is malformed");
  }
  return { status: body.status, tradingDisabled: body.trading_disabled };
}
