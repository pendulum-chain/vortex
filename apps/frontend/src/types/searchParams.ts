import { EPaymentMethod, RampDirection } from "@vortexfi/shared";
import { z } from "zod";

/**
 * Schema that accepts both string and number without transformation.
 * TanStack Router uses JSON serialization, so we must not transform
 * to avoid adding quotes to the URL.
 */
const stringOrNumberParam = z.union([z.string(), z.number()]).optional();

/**
 * Zod schema for ramp search parameters.
 */
export const rampSearchSchema = z.object({
  apiKey: z.string().optional(),
  callbackUrl: z.string().optional(),
  code: z.string().optional(),
  countryCode: z.string().optional(),
  cryptoLocked: z.string().optional(),
  externalSessionId: z.string().optional(),
  fiat: z.string().optional(),
  inputAmount: stringOrNumberParam,
  network: z.string().optional(),
  partnerId: z.string().optional(),
  paymentMethod: z
    .preprocess(val => (typeof val === "string" ? val.toLowerCase() : val), z.nativeEnum(EPaymentMethod))
    .optional()
    .catch(undefined),
  quoteId: z.string().optional(),
  rampType: z
    .preprocess(val => (typeof val === "string" ? val.toUpperCase() : val), z.nativeEnum(RampDirection))
    .optional()
    .catch(undefined),
  walletAddressLocked: z.string().optional()
});

export type RampSearchParams = z.infer<typeof rampSearchSchema>;
