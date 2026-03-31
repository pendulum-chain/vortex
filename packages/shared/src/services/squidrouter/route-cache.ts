import type { RouteParams, SquidrouterRouteResult } from "./route";

interface CachedRoute {
  result: SquidrouterRouteResult;
  timestamp: number;
}

export const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const routeCache = new Map<string, CachedRoute>();

/**
 * Produces a deterministic JSON string for any value by sorting object keys recursively.
 * Unlike JSON.stringify, this guarantees identical output regardless of property insertion order.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return "{" + sortedKeys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function generateRouteCacheKey(params: RouteParams): string {
  // Exclude fields that don't affect route pricing but differ across quote requests:
  // - fromAddress / toAddress: random placeholder addresses generated per request
  // - postHook: contains address-specific calldata (receivingContractAddress) that varies
  //   per request even though the route pricing is identical
  const { fromAddress: _from, toAddress: _to, postHook: _hook, ...routeFields } = params;
  return stableStringify(routeFields);
}

export function getCachedRoute(cacheKey: string): SquidrouterRouteResult | undefined {
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  return undefined;
}

export function setCachedRoute(cacheKey: string, result: SquidrouterRouteResult): void {
  evictExpiredCacheEntries();
  routeCache.set(cacheKey, { result, timestamp: Date.now() });
}

/** Evict all entries whose TTL has expired. Called lazily on cache writes. */
function evictExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      routeCache.delete(key);
    }
  }
}
