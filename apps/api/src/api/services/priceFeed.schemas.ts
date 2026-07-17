import { z } from "zod";

/**
 * External API contract schema for the CoinGecko price feed consumed by
 * PriceFeedService (see docs/features/contract-tests.md).
 *
 * GET /simple/price returns `{ [tokenId]: { [vsCurrency]: number } }`;
 * getCryptoPrice reads exactly `data[tokenId][vsCurrency]` and treats a missing
 * token or currency key as an error, so the consumed contract is: every entry
 * present is an object of numeric prices. Which keys must be present depends on
 * the request — the contract test asserts presence for the ids it requested.
 *
 * The Nabla AMM and DIA oracle rates the service also serves are read from
 * Pendulum chain state, not HTTP — out of scope per the no-chain-fidelity
 * non-goal of the contract-test PRD.
 */
export const coingeckoSimplePriceResponseSchema = z.record(z.string(), z.record(z.string(), z.number())) satisfies z.ZodType<
  Record<string, Record<string, number>>
>;
