import { z } from "zod";
import type { SquidRouterPayResponse, SquidrouterRoute, SquidrouterRouteEstimate } from "./route";

/**
 * External API contract schemas for SquidRouter (see docs/features/contract-tests.md).
 *
 * These model the raw wire JSON of the fields Vortex actually consumes — not the full
 * partner response. Unknown extra fields always pass (loose objects); a removed or
 * renamed consumed field fails. Discipline: no z.any(), no .optional() unless the code
 * genuinely tolerates absence, no input-widening coercions.
 */

// Consumed subsets of the full shared types. Deriving them via Pick ties the schemas to
// the types: renaming a consumed field in route.ts breaks compilation here.
// aggregateSlippage is optional because getRoute reads it defensively (`estimate?.aggregateSlippage !== undefined`).
type ConsumedRouteEstimate = Pick<SquidrouterRouteEstimate, "toAmount" | "toToken"> &
  Partial<Pick<SquidrouterRouteEstimate, "aggregateSlippage">>;
type ConsumedRoute = Pick<SquidrouterRoute, "quoteId" | "transactionRequest"> & { estimate: ConsumedRouteEstimate };
type ConsumedPayStatus = Pick<SquidRouterPayResponse, "isGMPTransaction" | "status">;

const RAW_UNITS = /^\d+$/;
// gasLimit is BigInt-parsed downstream (normalizeBigIntString in route-transactions,
// BigInt() in final-settlement-subsidy); both accept decimal or 0x-hex integer strings.
const BIGINT_STRING = /^(?:\d+|0x[0-9a-fA-F]+)$/;
const HEX_DATA = /^0x[0-9a-fA-F]*$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The body of a POST /v2/route response (`data` after JSON parsing). */
export const squidrouterRouteResponseSchema = z.looseObject({
  route: z.looseObject({
    estimate: z.looseObject({
      aggregateSlippage: z.number().optional(),
      toAmount: z.string().regex(RAW_UNITS),
      toToken: z.looseObject({ decimals: z.number().int().positive() })
    }),
    quoteId: z.string().min(1),
    transactionRequest: z.looseObject({
      data: z.string().regex(HEX_DATA),
      gasLimit: z.string().regex(BIGINT_STRING),
      target: z.string().regex(EVM_ADDRESS),
      value: z.string().regex(RAW_UNITS)
    })
  })
}) satisfies z.ZodType<{ route: ConsumedRoute }>;

/** The body of a GET /v2/status response. */
export const squidrouterStatusResponseSchema = z.looseObject({
  isGMPTransaction: z.boolean(),
  status: z.string().min(1)
}) satisfies z.ZodType<ConsumedPayStatus>;
