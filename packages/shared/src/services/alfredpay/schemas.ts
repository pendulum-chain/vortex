import { z } from "zod";
import { AlfredpayCustomerType } from "../../tokens/types/base";
import {
  AlfredpayConfigPair,
  AlfredpayFee,
  AlfredpayFiatAccount,
  AlfredpayFiatAccountType,
  AlfredpayFiatPaymentInstructions,
  AlfredpayKycStatus,
  AlfredpayOfframpStatus,
  AlfredpayOfframpTransaction,
  AlfredpayOnrampQuote,
  AlfredpayOnrampStatus,
  AlfredpayOnrampTransaction,
  GetKycStatusResponse
} from "./types";

/**
 * External API contract schemas for Alfredpay (see docs/features/contract-tests.md).
 *
 * These model the raw wire JSON of the fields Vortex actually consumes — not the full
 * partner response. Unknown extra fields always pass (loose objects); a removed or
 * renamed consumed field fails. Discipline: no z.any(), no .optional() unless the code
 * genuinely tolerates absence, no input-widening coercions.
 */

// Consumed subsets of the full shared types. Deriving them via Pick ties the schemas to
// the types: renaming a consumed field in types.ts breaks compilation here.
type ConsumedConfigPair = Pick<
  AlfredpayConfigPair,
  "fromCurrency" | "toCurrency" | "minQuantity" | "maxQuantity" | "decimals" | "typeCustomer"
>;
type ConsumedFee = Pick<AlfredpayFee, "amount" | "currency">;
type ConsumedQuote = Pick<AlfredpayOnrampQuote, "quoteId" | "fromAmount" | "toAmount" | "expiration"> & {
  fees: ConsumedFee[];
};
type ConsumedOnrampTransaction = Pick<AlfredpayOnrampTransaction, "status"> & {
  metadata?: { txHash?: string; failureReason?: string } | null;
};
type ConsumedOfframpTransaction = Pick<
  AlfredpayOfframpTransaction,
  "transactionId" | "status" | "depositAddress" | "expiration" | "toCurrency" | "fromAmount"
>;
type ConsumedFiatAccount = Pick<AlfredpayFiatAccount, "fiatAccountId" | "accountNumber" | "type" | "accountName"> & {
  metadata?: { accountHolderName?: string };
};
type ConsumedKycStatus = Pick<GetKycStatusResponse, "status"> & {
  metadata?: { failureReason?: string } | null;
};

const DECIMAL_STRING = /^\d+(\.\d+)?$/;
const DIGITS = /^\d+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// expiration is consumed via `new Date(...)` — the property that matters is parseability.
const parseableTimestamp = z.string().refine(value => !Number.isNaN(Date.parse(value)), "not a parseable timestamp");

/** One entry of the GET …/configurations `supportedPairs` array. */
export const alfredpayConfigPairSchema = z.looseObject({
  decimals: z.string().regex(DIGITS),
  fromCurrency: z.string().min(1),
  maxQuantity: z.string().regex(DECIMAL_STRING),
  minQuantity: z.string().regex(DECIMAL_STRING),
  toCurrency: z.string().min(1),
  typeCustomer: z.enum(AlfredpayCustomerType).nullable()
}) satisfies z.ZodType<ConsumedConfigPair>;

/** The body of a GET …/configurations response. */
export const alfredpayConfigsResponseSchema = z.looseObject({
  supportedPairs: z.array(alfredpayConfigPairSchema)
}) satisfies z.ZodType<{ supportedPairs: ConsumedConfigPair[] }>;

/**
 * The body of a POST …/quotes response, BUY and SELL alike — the consumed fields are
 * direction-independent (`fromCurrency`/`toCurrency`/`rate` are never read back; Vortex
 * trusts its own request there).
 */
export const alfredpayQuoteResponseSchema = z.looseObject({
  expiration: parseableTimestamp,
  fees: z.array(
    z.looseObject({
      amount: z.string().regex(DECIMAL_STRING),
      currency: z.string().min(1)
    })
  ),
  fromAmount: z.string().regex(DECIMAL_STRING),
  quoteId: z.string().min(1),
  toAmount: z.string().regex(DECIMAL_STRING)
}) satisfies z.ZodType<ConsumedQuote>;

/**
 * The body of a POST …/onramp response. `fiatPaymentInstructions` is forwarded to the
 * client verbatim (rail-specific fields, read only by the frontend) — the consumed
 * contract is "a JSON object is present".
 */
export const alfredpayCreateOnrampResponseSchema = z.looseObject({
  fiatPaymentInstructions: z.looseObject({}),
  transaction: z.looseObject({
    transactionId: z.string().min(1)
  })
}) satisfies z.ZodType<{
  transaction: Pick<AlfredpayOnrampTransaction, "transactionId">;
  fiatPaymentInstructions: Partial<AlfredpayFiatPaymentInstructions>;
}>;

/** The body of a GET …/onramp/{id} response. */
export const alfredpayOnrampTransactionSchema = z.looseObject({
  metadata: z
    .looseObject({
      failureReason: z.string().optional(),
      txHash: z.string().optional()
    })
    .nullish(),
  status: z.enum(AlfredpayOnrampStatus)
}) satisfies z.ZodType<ConsumedOnrampTransaction>;

/** The body of a POST …/offramp and GET …/offramp/{id} response (same transaction shape). */
export const alfredpayOfframpTransactionSchema = z.looseObject({
  depositAddress: z.string().regex(EVM_ADDRESS),
  expiration: parseableTimestamp,
  fromAmount: z.string().regex(DECIMAL_STRING),
  status: z.enum(AlfredpayOfframpStatus),
  toCurrency: z.string().min(1),
  transactionId: z.string().min(1)
}) satisfies z.ZodType<ConsumedOfframpTransaction>;

/** The body of a GET …/fiatAccounts response. */
export const alfredpayFiatAccountsResponseSchema = z.array(
  z.looseObject({
    accountName: z.string().optional(),
    accountNumber: z.string().min(1),
    fiatAccountId: z.string().min(1),
    metadata: z.looseObject({ accountHolderName: z.string().optional() }).optional(),
    type: z.enum(AlfredpayFiatAccountType)
  })
) satisfies z.ZodType<ConsumedFiatAccount[]>;

/** The body of a GET …/kyc/{submissionId}/status (and KYB equivalent) response. */
export const alfredpayKycStatusResponseSchema = z.looseObject({
  metadata: z.looseObject({ failureReason: z.string().optional() }).nullish(),
  status: z.enum(AlfredpayKycStatus)
}) satisfies z.ZodType<ConsumedKycStatus>;

/**
 * The 409 error body of a trade-limit breach, parsed in `executeRequest` into
 * `AlfredpayTradeLimitError`. Exactly one of `minQuantity`/`maxQuantity` is expected;
 * the client branches on `maxQuantity !== undefined`. Unlike the configuration
 * endpoint's stringly quantities, these arrive as JSON numbers (observed live:
 * `"maxQuantity":86996891.21`); the client stringifies them at the boundary.
 */
export const alfredpayLimitErrorBodySchema = z.looseObject({
  errorCode: z.literal(111426),
  errorMetadata: z.looseObject({
    fromCurrency: z.string().min(1),
    maxQuantity: z.number().optional(),
    minQuantity: z.number().optional()
  })
}) satisfies z.ZodType<{
  errorCode: 111426;
  errorMetadata: { fromCurrency: string; minQuantity?: number; maxQuantity?: number };
}>;
