import { parseUnits } from "viem";

/**
 * Partner reference rate for the forwarder fee bands
 * (docs/adr-0005-monerium-b2b-onramp.md, P12): the Coinbase Exchange EURC-USD
 * ticker, fetched fresh before every swap and recorded on the execution row so the
 * partner can audit each swap against the public trade history. The keeper passes the
 * rate into swapAndForward; the contract rejects it outside its Chainlink band.
 */

export const COINBASE_EURC_TICKER_URL = "https://api.exchange.coinbase.com/products/EURC-USD/ticker";
export const COINBASE_REFERENCE_SOURCE = "coinbase-exchange:EURC-USD";
const FETCH_TIMEOUT_MS = 5_000;

export interface ReferenceQuote {
  /** The ticker price as returned, e.g. "1.1432". */
  price: string;
  /** The price scaled to the forwarder's ORACLE_DECIMALS. */
  rateRaw: bigint;
  source: string;
  time: Date;
  /** Coinbase's trade id for the tick, when present — the audit anchor. */
  tradeId: string | null;
}

/** Decimal price string -> integer at `decimals`. Rejects malformed or non-positive input. */
export function toReferenceRateRaw(price: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(price)) {
    throw new Error(`reference price is not a decimal number: ${price}`);
  }
  const raw = parseUnits(price, decimals);
  if (raw <= 0n) {
    throw new Error(`reference price must be positive: ${price}`);
  }
  return raw;
}

/** Mirrors VortexForwarder._checkedReference: |reference - oracle| <= oracle x band / 10000. */
export function isWithinReferenceBand(rateRaw: bigint, oracleRaw: bigint, bandBps: number): boolean {
  const tolerance = (oracleRaw * BigInt(bandBps)) / 10_000n;
  return rateRaw + tolerance >= oracleRaw && rateRaw <= oracleRaw + tolerance;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches the live ticker. Any failure throws; the caller defers the swap. */
export async function fetchCoinbaseReference(decimals: number, fetchImpl: FetchLike = fetch): Promise<ReferenceQuote> {
  const response = await fetchImpl(COINBASE_EURC_TICKER_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Coinbase ticker responded ${response.status}`);
  }
  const body = (await response.json()) as { price?: unknown; time?: unknown; trade_id?: unknown } | null;
  if (!body || typeof body.price !== "string") {
    throw new Error("Coinbase ticker response has no price");
  }
  const time = typeof body.time === "string" ? new Date(body.time) : new Date();
  if (Number.isNaN(time.getTime())) {
    throw new Error(`Coinbase ticker time is not a timestamp: ${String(body.time)}`);
  }
  return {
    price: body.price,
    rateRaw: toReferenceRateRaw(body.price, decimals),
    source: COINBASE_REFERENCE_SOURCE,
    time,
    tradeId: typeof body.trade_id === "number" || typeof body.trade_id === "string" ? String(body.trade_id) : null
  };
}
