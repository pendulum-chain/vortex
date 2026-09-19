import { formatUnits, parseUnits } from "viem";

/**
 * Partner reference rate for the forwarder fee bands (docs/adr-0005-monerium-b2b-onramp.md, P12):
 * the Coinbase Exchange EURC-USDC bid/ask midpoint, read fresh before every swap and
 * recorded on the execution row (rate, source, time) so the partner can check it against
 * Coinbase's public ticker. Spot rather than an average (amendment 2026-09-18): an average
 * lags a moving market, and the lag would turn into subsidy in a falling one. The midpoint
 * rather than the last trade because a last print can be one-sided or minutes stale on a
 * quiet weekend; a wide spread is itself a thin market, and the keeper then defers rather
 * than pricing against it. The keeper passes the rate into `swap`; the contract rejects it
 * outside its Chainlink band.
 */

/**
 * The Coinbase Exchange product the reference is read from. EURC-USD and EURC-EUR were
 * delisted on 2024-08-29 and still answer their endpoints with two-year-old data, so
 * the product's status is monitored (`fetchCoinbaseProductStatus`), not assumed.
 */
export const COINBASE_REFERENCE_PRODUCT = "EURC-USDC";
export const COINBASE_EURC_PRODUCT_URL = `https://api.exchange.coinbase.com/products/${COINBASE_REFERENCE_PRODUCT}`;
export const COINBASE_EURC_TICKER_URL = `${COINBASE_EURC_PRODUCT_URL}/ticker`;
export const COINBASE_REFERENCE_SOURCE = `coinbase-exchange:${COINBASE_REFERENCE_PRODUCT}:mid`;
/** A top of book wider than this is too thin to be a reference; the keeper defers. */
export const MAX_SPREAD_BPS = 50;
const FETCH_TIMEOUT_MS = 5_000;

export interface ReferenceQuote {
  /** The reference as a decimal string at the oracle's decimals, e.g. "1.14320000". */
  price: string;
  /** The reference scaled to the forwarder's ORACLE_DECIMALS. */
  rateRaw: bigint;
  source: string;
  /** When the reference was read. */
  time: Date;
}

/** Mirrors VortexForwarder._checkedReference: |reference - oracle| <= oracle x band / 10000. */
export function isWithinReferenceBand(rateRaw: bigint, oracleRaw: bigint, bandBps: number): boolean {
  const tolerance = (oracleRaw * BigInt(bandBps)) / 10_000n;
  return rateRaw + tolerance >= oracleRaw && rateRaw <= oracleRaw + tolerance;
}

export interface TopOfBook {
  ask: string;
  bid: string;
}

/** Extracts the top of book from a Coinbase ticker response; anything but two positive decimals throws. */
export function parseTicker(body: unknown): TopOfBook {
  const ticker = body as { ask?: unknown; bid?: unknown } | null;
  const bid = ticker?.bid;
  const ask = ticker?.ask;
  if (typeof bid !== "string" || typeof ask !== "string" || !/^\d+(\.\d+)?$/.test(bid) || !/^\d+(\.\d+)?$/.test(ask)) {
    throw new Error("Coinbase ticker response is malformed");
  }
  return { ask, bid };
}

/** Spread of the top of book in bps of the midpoint (floored). */
export function spreadBps(book: TopOfBook, decimals: number): number {
  const bid = parseUnits(book.bid, decimals);
  const ask = parseUnits(book.ask, decimals);
  if (bid <= 0n || ask < bid) {
    throw new Error(`Coinbase top of book is inverted or empty (bid ${book.bid}, ask ${book.ask})`);
  }
  const mid = (bid + ask) / 2n;
  return Number(((ask - bid) * 10_000n) / mid);
}

/** The bid/ask midpoint scaled to `decimals`, floored to the unit. */
export function computeMid(book: TopOfBook, decimals: number): bigint {
  return (parseUnits(book.bid, decimals) + parseUnits(book.ask, decimals)) / 2n;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Reads the ticker and returns the midpoint. Any failure throws; the caller defers. */
export async function fetchCoinbaseReference(
  decimals: number,
  fetchImpl: FetchLike = fetch,
  nowMs: number = Date.now()
): Promise<ReferenceQuote> {
  const response = await fetchImpl(COINBASE_EURC_TICKER_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Coinbase ticker responded ${response.status}`);
  }
  const book = parseTicker(await response.json());
  const spread = spreadBps(book, decimals);
  if (spread > MAX_SPREAD_BPS) {
    throw new Error(`Coinbase ${COINBASE_REFERENCE_PRODUCT} spread of ${spread} bps exceeds ${MAX_SPREAD_BPS} bps`);
  }
  const rateRaw = computeMid(book, decimals);
  if (rateRaw <= 0n) {
    throw new Error(`Coinbase ${COINBASE_REFERENCE_PRODUCT} midpoint is zero`);
  }
  return { price: formatUnits(rateRaw, decimals), rateRaw, source: COINBASE_REFERENCE_SOURCE, time: new Date(nowMs) };
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
