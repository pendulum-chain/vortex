import { z } from "zod";
import type { SquidRouterPayResponse, SquidrouterRoute, SquidrouterRouteEstimate } from "./route";

/**
 * External API contract schemas for SquidRouter (see docs/operations-testing.md).
 *
 * These model the raw wire JSON of the fields Vortex actually consumes — not the full
 * partner response. Unknown extra fields always pass (loose objects); a removed or
 * renamed consumed field fails. Discipline: no z.any(), no .optional() unless the code
 * genuinely tolerates absence, no input-widening coercions.
 */

// Consumed subsets of the full shared types. Deriving them via Pick ties the schemas to
// the types: renaming a consumed field in route.ts breaks compilation here.
type ConsumedPayStatus = Pick<SquidRouterPayResponse, "isGMPTransaction" | "status">;

const RAW_UNITS = /^\d+$/;
// gasLimit is BigInt-parsed downstream (normalizeBigIntString in route-transactions,
// BigInt() in final-settlement-subsidy); both accept decimal or 0x-hex integer strings.
const BIGINT_STRING = /^(?:\d+|0x[0-9a-fA-F]+)$/;
const HEX_DATA = /^0x[0-9a-fA-F]*$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const squidrouterRouteEstimateSchema = z
  .looseObject({
    aggregateSlippage: z.number().optional(),
    toAmount: z.string().regex(RAW_UNITS),
    toAmountMin: z.string().regex(RAW_UNITS),
    // Deliberately presence-only: quote creation for routes that never consume this
    // field (mint fee probes, the swap leg) must not fail on it. The API's
    // getSquidrouterRouteData Big-parses it tolerantly, and the only numeric consumer
    // (the SubsidizePost probe) degrades to its 1:1 fallback on an unusable value.
    toAmountUSD: z.string().min(1),
    toToken: z.looseObject({ decimals: z.number().int().positive() })
  })
  .superRefine((estimate, ctx) => {
    if (!RAW_UNITS.test(estimate.toAmount) || !RAW_UNITS.test(estimate.toAmountMin)) return;
    if (BigInt(estimate.toAmountMin) > BigInt(estimate.toAmount)) {
      ctx.addIssue({
        code: "custom",
        message: "toAmountMin must not exceed toAmount",
        path: ["toAmountMin"]
      });
    }
  });

/** The body of a POST /v2/route response (`data` after JSON parsing). */
export const squidrouterRouteResponseSchema = z.looseObject({
  route: z.looseObject({
    estimate: squidrouterRouteEstimateSchema,
    quoteId: z.string().min(1),
    transactionRequest: z.looseObject({
      data: z.string().regex(HEX_DATA),
      gasLimit: z.string().regex(BIGINT_STRING),
      target: z.string().regex(EVM_ADDRESS),
      value: z.string().regex(RAW_UNITS)
    })
  })
}) satisfies z.ZodType<{ route: SquidrouterRoute }>;

/** The body of a GET /v2/status response. */
export const squidrouterStatusResponseSchema = z.looseObject({
  isGMPTransaction: z.boolean(),
  status: z.string().min(1)
}) satisfies z.ZodType<ConsumedPayStatus>;
