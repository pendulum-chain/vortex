import type { Request } from "express";

const MAX_PAGE_SIZE = 100;

/** `?limit=` (default 20, at most 100) and `?offset=` (default 0); anything invalid falls back to the default. */
export function pageOf(query: Request["query"]): { limit: number; offset: number } {
  const rawLimit = Number(query.limit ?? 20);
  const rawOffset = Number(query.offset ?? 0);
  return {
    limit: Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE_SIZE) : 20,
    offset: Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
  };
}
