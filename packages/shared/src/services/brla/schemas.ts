import { z } from "zod";
import {
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaDocument,
  AveniaDocumentType,
  AveniaFeeType,
  AveniaKybAttemptStatusResponse,
  AveniaOperationFee,
  AveniaPayinTicket,
  AveniaPayoutTicket,
  AveniaQuoteResponse,
  AveniaSubaccountAccountInfo,
  AveniaSubaccountWallet,
  AveniaTicketStatus,
  AveniaUboResponse,
  KycAttemptResult,
  KycAttemptStatus,
  KycLevel1Response,
  Limit,
  PixInputTicketOutput,
  PixKeyData,
  PixOutputTicketOutput,
  UsedLimitDetails
} from "./types";

/**
 * External API contract schemas for Avenia/BRLA (see docs/operations-testing.md).
 *
 * These model the raw wire JSON of the fields Vortex actually consumes — not the full
 * partner response. Unknown extra fields always pass (loose objects); a removed or
 * renamed consumed field fails. Discipline: no z.any(), no .optional() unless the code
 * genuinely tolerates absence, no input-widening coercions.
 *
 * The schemas describe the *return values of the BrlaApiService methods* — for the
 * ticket getters that is the payload after the client unwraps the `ticket`/`tickets`
 * envelope and discriminates pay-in vs. payout; the envelope itself is exercised by the
 * live suite through the real client (an envelope rename surfaces as the client's
 * "Invalid response from Avenia API" error).
 */

// Consumed subsets of the full shared types. Deriving them via Pick ties the schemas to
// the types: renaming a consumed field in types.ts breaks compilation here.
type ConsumedFee = Pick<AveniaOperationFee, "type" | "amount">;
type ConsumedQuote = Pick<AveniaQuoteResponse, "quoteToken" | "inputAmount" | "outputAmount"> & {
  appliedFees: ConsumedFee[];
};
type ConsumedLimit = Pick<Limit, "currency" | "maxFiatIn" | "maxFiatOut"> & {
  usedLimit: Pick<UsedLimitDetails, "month" | "usedFiatIn" | "usedFiatOut" | "year">;
};
type ConsumedAccountInfo = Pick<AveniaAccountInfoResponse, "brCode"> & {
  accountInfo: Pick<AveniaSubaccountAccountInfo, "identityStatus">;
  wallets: Pick<AveniaSubaccountWallet, "chain" | "walletAddress">[];
};

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/** The body of a GET /v2/account/quote/fixed-rate response (pay-in, payout, and swap quotes alike). */
export const aveniaQuoteResponseSchema = z.looseObject({
  appliedFees: z.array(
    z.looseObject({
      amount: z.string().regex(DECIMAL_STRING),
      type: z.enum(AveniaFeeType)
    })
  ),
  inputAmount: z.string().regex(DECIMAL_STRING),
  outputAmount: z.string().regex(DECIMAL_STRING),
  quoteToken: z.string().min(1)
}) satisfies z.ZodType<ConsumedQuote>;

/**
 * The body of a GET /v2/account/bank-accounts/brl/pix-info response. `taxId` arrives
 * masked (e.g. `***.123.456-**`)
 * and is consumed by mask-aware comparison, so the only wire property is non-emptiness.
 */
export const aveniaPixKeyDataSchema = z.looseObject({
  taxId: z.string().min(1)
}) satisfies z.ZodType<Pick<PixKeyData, "taxId">>;

/** A POST /v2/account/tickets response for a PIX pay-in ticket. */
export const aveniaPixInputTicketSchema = z.looseObject({
  brCode: z.string().min(1),
  id: z.string().min(1)
}) satisfies z.ZodType<Pick<PixInputTicketOutput, "id" | "brCode">>;

/** A POST /v2/account/tickets response for a PIX payout ticket. */
export const aveniaPixOutputTicketSchema = z.looseObject({
  id: z.string().min(1)
}) satisfies z.ZodType<PixOutputTicketOutput>;

/** A payout ticket as returned by `getAveniaPayoutTicket` (unwrapped from the `ticket` envelope). */
export const aveniaPayoutTicketSchema = z.looseObject({
  status: z.enum(AveniaTicketStatus)
}) satisfies z.ZodType<Pick<AveniaPayoutTicket, "status">>;

/** The pay-in tickets list as returned by `getAveniaPayinTickets` (unwrapped and discriminated). */
export const aveniaPayinTicketsSchema = z.array(
  z.looseObject({
    id: z.string().min(1),
    status: z.enum(AveniaTicketStatus)
  })
) satisfies z.ZodType<Pick<AveniaPayinTicket, "id" | "status">[]>;

/** The body of a GET /v2/account/limits response. */
export const aveniaAccountLimitsSchema = z.looseObject({
  limitInfo: z.looseObject({
    limits: z.array(
      z.looseObject({
        currency: z.string().min(1),
        maxFiatIn: z.string().regex(DECIMAL_STRING),
        maxFiatOut: z.string().regex(DECIMAL_STRING),
        usedLimit: z.looseObject({
          month: z.number().int().min(1).max(12),
          usedFiatIn: z.string().regex(DECIMAL_STRING),
          usedFiatOut: z.string().regex(DECIMAL_STRING),
          year: z.number().int()
        })
      })
    )
  })
}) satisfies z.ZodType<{ limitInfo: { limits: ConsumedLimit[] } }>;

/**
 * The body of a GET /v2/account/balances response. Balances are decimal strings on
 * the wire (observed live: `"BRLA":"99.8"`), not numbers.
 */
export const aveniaAccountBalanceSchema = z.looseObject({
  balances: z.looseObject({
    BRLA: z.string().regex(DECIMAL_STRING)
  })
}) satisfies z.ZodType<{ balances: Pick<AveniaAccountBalanceResponse["balances"], "BRLA"> }>;

/** The body of a GET /v2/account/account-info response. */
export const aveniaAccountInfoSchema = z.looseObject({
  accountInfo: z.looseObject({
    identityStatus: z.enum(["NOT-IDENTIFIED", "CONFIRMED"])
  }),
  brCode: z.string().min(1),
  wallets: z.array(
    z.looseObject({
      chain: z.string().min(1),
      walletAddress: z.string().min(1)
    })
  )
}) satisfies z.ZodType<ConsumedAccountInfo>;

/** A document after Avenia has processed the bytes uploaded to its pre-signed URL. */
export const aveniaDocumentResponseSchema = z.looseObject({
  document: z.looseObject({
    documentType: z.enum(AveniaDocumentType),
    id: z.string().min(1),
    ready: z.boolean(),
    uploadStatusFront: z.string().min(1)
  })
}) satisfies z.ZodType<{
  document: Pick<AveniaDocument, "documentType" | "id" | "ready" | "uploadStatusFront">;
}>;

/** The identifier returned by UBO creation. */
export const aveniaUboResponseSchema = z.looseObject({
  id: z.string().min(1)
}) satisfies z.ZodType<AveniaUboResponse>;

/** The attempt identifier returned by API-based KYC and KYB Level 1 submissions. */
export const aveniaLevel1ResponseSchema = z.looseObject({
  id: z.string().min(1)
}) satisfies z.ZodType<KycLevel1Response>;

/** A KYB attempt returned by GET /v2/kyc/attempts/{attemptId}. */
export const aveniaKybAttemptStatusSchema = z.looseObject({
  attempt: z.looseObject({
    createdAt: z.string().min(1),
    id: z.string().min(1),
    levelName: z.string().min(1),
    result: z.enum(KycAttemptResult).optional(),
    resultMessage: z.string(),
    retryable: z.boolean(),
    status: z.enum(KycAttemptStatus),
    updatedAt: z.string().min(1)
  })
}) satisfies z.ZodType<AveniaKybAttemptStatusResponse>;
