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
  // KYB deep link, no quote. Presence enables it; a region-code value (e.g. `?kyb=BR`) prefills the selector.
  // Union with boolean so a bare `?kyb` flag validates too.
  kyb: z.union([z.string(), z.boolean()]).optional(),
  // Like `kyb`, but the region is locked in and the selector is skipped (e.g. `?kybLocked=BR`).
  kybLocked: z.union([z.string(), z.boolean()]).optional(),
  network: z.string().optional(),
  partnerId: z.string().optional(),
  paymentMethod: z.string().optional(),
  quoteId: z.string().optional(),
  rampType: z.string().optional(),
  walletAddressLocked: z.string().optional()
});

export type RampSearchParams = z.infer<typeof rampSearchSchema>;
