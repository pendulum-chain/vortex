import { z } from "zod";
import {
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaDocument,
  AveniaDocumentGetResponse,
  AveniaFeeType,
  AveniaImportKycTokenResponse,
  AveniaOperationFee,
  AveniaPayinTicket,
  AveniaPayoutTicket,
  AveniaQuoteResponse,
  AveniaSubaccountAccountInfo,
  AveniaSubaccountWallet,
  AveniaTicketStatus,
  AveniaVerificationAttemptResponse,
  AveniaWebhook,
  AveniaWebhookRegistration,
  AveniaWebhooksListResponse,
  BrDocumentType,
  BrUboResponse,
  DocumentUploadResponse,
  GetKycAttemptResponse,
  KybLevel1Response,
  KycAttempt,
  KycAttemptResult,
  KycAttemptStatus,
  KycLevel1Response,
  LivenessDocumentResponse,
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
    createdAt: z.string().min(1).optional(),
    documentType: z.enum(BrDocumentType),
    id: z.string().min(1),
    ready: z.boolean(),
    updatedAt: z.string().min(1).optional(),
    uploadErrorBack: z.string().optional(),
    uploadErrorFront: z.string().optional(),
    uploadStatusBack: z.string().optional(),
    uploadStatusFront: z.string().min(1),
    uploadURLBack: z.string().optional(),
    uploadURLFront: z.string().optional()
  })
}) satisfies z.ZodType<{ document: AveniaDocument }>;

const aveniaCursorSchema = z
  .string()
  .nullish()
  .transform(value => value || undefined);

/** Paginated document history used by readiness and method reconciliation. */
export const aveniaDocumentsSchema = z.looseObject({
  cursor: aveniaCursorSchema,
  documents: z.array(aveniaDocumentResponseSchema.shape.document)
}) satisfies z.ZodType<AveniaDocumentGetResponse>;

/** The pre-signed upload target returned for a file-backed Avenia document. */
export const aveniaDocumentUploadResponseSchema = z.looseObject({
  id: z.string().min(1),
  uploadURLBack: z.string().optional(),
  uploadURLFront: z.string().min(1)
}) satisfies z.ZodType<DocumentUploadResponse>;

/** The provider-hosted capture target returned for SELFIE-FROM-LIVENESS. */
export const aveniaLivenessDocumentResponseSchema = z.looseObject({
  id: z.string().min(1),
  livenessUrl: z.string().min(1),
  validateLivenessToken: z.string().min(1)
}) satisfies z.ZodType<LivenessDocumentResponse>;

/** The identifier returned by UBO creation. */
export const aveniaUboResponseSchema = z.looseObject({
  id: z.string().min(1)
}) satisfies z.ZodType<BrUboResponse>;

/** The attempt identifier returned by API-based KYC and KYB Level 1 submissions. */
export const aveniaLevel1ResponseSchema = z.looseObject({
  id: z.string().min(1)
}) satisfies z.ZodType<KycLevel1Response>;

/** The attempt identifier and acknowledgement returned after importing a Sumsub share token. */
export const aveniaImportKycTokenResponseSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1)
}) satisfies z.ZodType<AveniaImportKycTokenResponse>;

/** The hosted company KYB attempt and continuation URLs. */
export const aveniaKybLevel1ResponseSchema = z.looseObject({
  attemptId: z.string().min(1),
  authorizedRepresentativeUrl: z.string().min(1),
  basicCompanyDataUrl: z.string().min(1)
}) satisfies z.ZodType<KybLevel1Response>;

const aveniaAttemptSchema = z.looseObject({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1),
  levelName: z.string().min(1),
  result: z
    .enum(KycAttemptResult)
    .nullish()
    .transform(value => value ?? undefined),
  resultMessage: z
    .string()
    .nullish()
    .transform(value => value ?? undefined),
  retryable: z.boolean().optional(),
  status: z.enum(KycAttemptStatus),
  submissionData: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string().datetime({ offset: true })
}) satisfies z.ZodType<KycAttempt>;

/** Paginated attempt history used to reconcile an ambiguous submission. */
export const aveniaKycAttemptsSchema = z.looseObject({
  attempts: z.array(aveniaAttemptSchema),
  cursor: aveniaCursorSchema
}) satisfies z.ZodType<GetKycAttemptResponse>;

/** An individual or company verification attempt returned by GET /v2/kyc/attempts/{attemptId}. */
export const aveniaVerificationAttemptSchema = z.looseObject({
  attempt: aveniaAttemptSchema
}) satisfies z.ZodType<AveniaVerificationAttemptResponse>;

export const aveniaKybAttemptStatusSchema = aveniaVerificationAttemptSchema;

/** The body returned after POST /v2/notifications/webhooks. */
export const aveniaWebhookRegistrationSchema = z.looseObject({
  webhookId: z.string().min(1)
}) satisfies z.ZodType<AveniaWebhookRegistration>;

/** An entry in the GET /v2/notifications/webhooks response. */
export const aveniaWebhookSchema = z.looseObject({
  id: z.string().min(1),
  subscriptions: z.array(z.string().min(1)),
  url: z.string().url()
}) satisfies z.ZodType<AveniaWebhook>;

/** The body returned by GET /v2/notifications/webhooks. */
export const aveniaWebhooksListSchema = z.looseObject({
  webhooks: z.array(aveniaWebhookSchema)
}) satisfies z.ZodType<AveniaWebhooksListResponse>;
