import { z } from "zod";
import {
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
  MONERIUM_CHAINS,
  MONERIUM_ORDER_FILTER_STATES,
  MONERIUM_ORDER_STATES,
  MONERIUM_PROFILE_KINDS,
  MONERIUM_PROFILE_STATES,
  MONERIUM_SECTION_STATES,
  MONERIUM_VERIFICATION_KINDS,
  MONERIUM_WEBHOOK_TYPES,
  type MoneriumAccessTokenResponse,
  type MoneriumAddress,
  type MoneriumCreateWebhookRequest,
  type MoneriumIban,
  type MoneriumIbanDestinationRequest,
  type MoneriumIbanUpdatedData,
  type MoneriumLinkAddressRequest,
  type MoneriumListAddressesResponse,
  type MoneriumListIbansResponse,
  type MoneriumListOrdersResponse,
  type MoneriumListProfilesResponse,
  type MoneriumListWebhooksResponse,
  type MoneriumOrder,
  type MoneriumProfile,
  type MoneriumProfileSummary,
  type MoneriumRedeemOrderRequest,
  type MoneriumUpdateWebhookRequest,
  type MoneriumUploadedFile,
  type MoneriumWebhookEvent,
  type MoneriumWebhookSubscription
} from "./types";

/**
 * Monerium API v2 wire contracts consumed by Vortex. Unknown provider fields pass;
 * missing or renamed consumed fields fail. Request schemas additionally pin the
 * signing-message and threshold semantics that must agree with the submitted signature.
 */

const UUID = z.string().uuid();
const EVM_ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const HEX_BYTES = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const IBAN = z.string().regex(/^[A-Z]{2}[0-9A-Z ]{13,32}$/);
const NORMALIZED_IBAN = z.string().regex(/^[A-Z]{2}[0-9A-Z]{13,32}$/);
const DECIMAL_AMOUNT = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
const COUNTRY_CODE = z.string().regex(/^[A-Z]{2}$/);
const RFC3339_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;

const moneriumChainSchema = z.enum(MONERIUM_CHAINS);
const moneriumTimestampSchema = z.string().datetime({ offset: true });

export const moneriumAccessTokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1)
}) satisfies z.ZodType<MoneriumAccessTokenResponse>;

export const moneriumProfileSummarySchema = z.looseObject({
  id: UUID,
  kind: z.enum(MONERIUM_PROFILE_KINDS),
  name: z.string().min(1),
  state: z.enum(MONERIUM_PROFILE_STATES)
}) satisfies z.ZodType<MoneriumProfileSummary>;

export const moneriumProfileSchema = moneriumProfileSummarySchema.extend({
  details: z.looseObject({ state: z.enum(MONERIUM_SECTION_STATES) }),
  form: z.looseObject({ state: z.enum(MONERIUM_SECTION_STATES) }),
  verifications: z.array(
    z.looseObject({
      kind: z.enum(MONERIUM_VERIFICATION_KINDS),
      state: z.enum(MONERIUM_SECTION_STATES)
    })
  )
}) satisfies z.ZodType<MoneriumProfile>;

export const moneriumListProfilesResponseSchema = z.looseObject({
  profiles: z.array(moneriumProfileSummarySchema)
}) satisfies z.ZodType<MoneriumListProfilesResponse>;

export const moneriumAddressSchema = z.looseObject({
  address: EVM_ADDRESS,
  chains: z.array(moneriumChainSchema),
  profile: UUID
}) satisfies z.ZodType<MoneriumAddress>;

export const moneriumListAddressesResponseSchema = z.looseObject({
  addresses: z.array(moneriumAddressSchema)
}) satisfies z.ZodType<MoneriumListAddressesResponse>;

export const moneriumLinkAddressRequestSchema = z.looseObject({
  address: EVM_ADDRESS,
  chain: moneriumChainSchema,
  message: z.literal(MONERIUM_ADDRESS_OWNERSHIP_MESSAGE),
  profile: UUID,
  signature: HEX_BYTES
}) satisfies z.ZodType<MoneriumLinkAddressRequest>;

export const moneriumAcceptedResponseSchema = z.looseObject({
  code: z.literal(202),
  status: z.literal("Accepted")
});

export const moneriumIbanSchema = z.looseObject({
  address: EVM_ADDRESS,
  bic: z.string().min(8).max(11),
  chain: moneriumChainSchema,
  iban: IBAN,
  name: z.string().min(1),
  profile: UUID
}) satisfies z.ZodType<MoneriumIban>;

export const moneriumListIbansResponseSchema = z.looseObject({
  ibans: z.array(moneriumIbanSchema)
}) satisfies z.ZodType<MoneriumListIbansResponse>;

export const moneriumIbanDestinationRequestSchema = z.looseObject({
  address: EVM_ADDRESS,
  chain: moneriumChainSchema
}) satisfies z.ZodType<MoneriumIbanDestinationRequest>;

const moneriumIbanIdentifierSchema = z.looseObject({
  iban: NORMALIZED_IBAN,
  standard: z.literal("iban")
});

const moneriumChainIdentifierSchema = z.looseObject({
  address: EVM_ADDRESS,
  chain: moneriumChainSchema,
  standard: z.literal("chain")
});

const moneriumPersonalDetailsSchema = z.looseObject({
  country: COUNTRY_CODE,
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

const moneriumCorporateDetailsSchema = z.looseObject({
  companyName: z.string().min(1),
  country: COUNTRY_CODE
});

function amountRequiresSupportingDocument(amount: string): boolean {
  const integer = amount.split(".")[0].replace(/^0+(?=\d)/, "");
  return integer.length > 5 || (integer.length === 5 && integer >= "15000");
}

export const moneriumRedeemOrderRequestSchema = z
  .looseObject({
    address: EVM_ADDRESS,
    amount: DECIMAL_AMOUNT,
    chain: moneriumChainSchema,
    counterpart: z.looseObject({
      details: z.union([moneriumPersonalDetailsSchema, moneriumCorporateDetailsSchema]),
      identifier: moneriumIbanIdentifierSchema
    }),
    currency: z.literal("eur"),
    id: UUID.optional(),
    kind: z.literal("redeem"),
    memo: z.string().min(5).max(140).optional(),
    message: z.string().min(1),
    referenceNumber: z.string().max(35).optional(),
    signature: HEX_BYTES,
    supportingDocumentId: UUID.optional()
  })
  .superRefine((request, context) => {
    const iban = request.counterpart.identifier.iban;
    const destinations = [iban, `${iban.slice(0, 4)}...${iban.slice(-4)}`];
    const prefix = destinations
      .map(destination => `Send EUR ${request.amount} to ${destination} at `)
      .find(value => request.message.startsWith(value));
    const timestamp = prefix ? request.message.slice(prefix.length) : "";
    const timestampMs = Date.parse(timestamp);
    if (!prefix || !RFC3339_MINUTE.test(timestamp) || Number.isNaN(timestampMs)) {
      context.addIssue({
        code: "custom",
        message: "message must exactly match the Monerium SEPA signing format",
        path: ["message"]
      });
    } else if (timestampMs < Date.now() - 5 * 60 * 1_000) {
      context.addIssue({
        code: "custom",
        message: "message timestamp must be no more than five minutes in the past",
        path: ["message"]
      });
    }
    if (amountRequiresSupportingDocument(request.amount) && !request.supportingDocumentId) {
      context.addIssue({
        code: "custom",
        message: "supportingDocumentId is required for amounts of EUR 15,000 or more",
        path: ["supportingDocumentId"]
      });
    }
  }) satisfies z.ZodType<MoneriumRedeemOrderRequest>;

const moneriumOrderSchemaInternal = z.looseObject({
  address: EVM_ADDRESS,
  amount: DECIMAL_AMOUNT,
  chain: moneriumChainSchema,
  counterpart: z.looseObject({
    details: z.looseObject({}).optional(),
    identifier: z.union([
      moneriumIbanIdentifierSchema,
      moneriumChainIdentifierSchema,
      z.looseObject({ standard: z.string().min(1) })
    ])
  }),
  currency: z.enum(["eur", "usd", "gbp", "isk"]),
  id: UUID,
  kind: z.enum(["issue", "redeem"]),
  memo: z.string(),
  meta: z.looseObject({
    placedAt: moneriumTimestampSchema,
    processedAt: moneriumTimestampSchema.optional(),
    rejectedReason: z.string().optional(),
    supportingDocumentId: UUID.optional(),
    txHashes: z.array(z.string().min(1)).optional()
  }),
  profile: UUID,
  referenceNumber: z.string().optional(),
  state: z.enum(MONERIUM_ORDER_STATES)
});

export const moneriumOrderSchema = moneriumOrderSchemaInternal satisfies z.ZodType<MoneriumOrder>;

export const moneriumListOrdersResponseSchema = z.looseObject({
  orders: z.array(moneriumOrderSchema)
}) satisfies z.ZodType<MoneriumListOrdersResponse>;

export const moneriumOrderFilterStateSchema = z.enum(MONERIUM_ORDER_FILTER_STATES);

export const moneriumUploadedFileSchema = z.looseObject({
  hash: z.string().min(1),
  id: UUID,
  meta: z.looseObject({
    createdAt: moneriumTimestampSchema,
    updatedAt: moneriumTimestampSchema,
    uploadedBy: z.string().min(1)
  }),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1)
}) satisfies z.ZodType<MoneriumUploadedFile>;

const moneriumWebhookSecretSchema = z
  .string()
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/)
  .refine(secret => {
    try {
      const byteLength = atob(secret.slice("whsec_".length)).length;
      return byteLength >= 24 && byteLength <= 64;
    } catch {
      return false;
    }
  }, "webhook secret must contain 24 to 64 base64-encoded random bytes");

export const moneriumCreateWebhookRequestSchema = z.looseObject({
  secret: moneriumWebhookSecretSchema,
  types: z.array(z.enum(MONERIUM_WEBHOOK_TYPES)).optional(),
  url: z.string().url().startsWith("https://")
}) satisfies z.ZodType<MoneriumCreateWebhookRequest>;

export const moneriumWebhookSubscriptionSchema = z.looseObject({
  id: UUID,
  state: z.enum(["active", "inactive"]),
  types: z.array(z.enum(MONERIUM_WEBHOOK_TYPES)),
  url: z.string().url()
}) satisfies z.ZodType<MoneriumWebhookSubscription>;

export const moneriumListWebhooksResponseSchema = z.looseObject({
  subscriptions: z.array(moneriumWebhookSubscriptionSchema)
}) satisfies z.ZodType<MoneriumListWebhooksResponse>;

export const moneriumUpdateWebhookRequestSchema = z
  .looseObject({
    state: z.enum(["active", "inactive"]).optional(),
    types: z.array(z.enum(MONERIUM_WEBHOOK_TYPES)).optional()
  })
  .refine(
    request => request.state !== undefined || request.types !== undefined,
    "at least one update field is required"
  ) satisfies z.ZodType<MoneriumUpdateWebhookRequest>;

const moneriumWebhookProfileSchema = z.looseObject({
  id: UUID,
  kind: z.enum(MONERIUM_PROFILE_KINDS),
  state: z.enum(MONERIUM_PROFILE_STATES)
});

export const moneriumIbanUpdatedDataSchema = z.looseObject({
  address: EVM_ADDRESS,
  bic: z.string().min(8).max(11).optional(),
  chain: moneriumChainSchema,
  iban: IBAN,
  name: z.string().min(1).optional(),
  profile: UUID,
  state: z.string().min(1).optional()
}) satisfies z.ZodType<MoneriumIbanUpdatedData>;

export const moneriumWebhookEventSchema = z.discriminatedUnion("type", [
  z.looseObject({ timestamp: moneriumTimestampSchema, type: z.literal("subscription.created") }),
  z.looseObject({ data: moneriumOrderSchema, timestamp: moneriumTimestampSchema, type: z.literal("order.created") }),
  z.looseObject({ data: moneriumOrderSchema, timestamp: moneriumTimestampSchema, type: z.literal("order.updated") }),
  z.looseObject({ data: moneriumWebhookProfileSchema, timestamp: moneriumTimestampSchema, type: z.literal("profile.updated") }),
  z.looseObject({
    data: z.looseObject({
      errors: z.array(z.looseObject({ field: z.string().min(1), reason: z.string().min(1) })),
      id: UUID,
      kind: z.enum(MONERIUM_PROFILE_KINDS)
    }),
    timestamp: moneriumTimestampSchema,
    type: z.literal("profile.error")
  }),
  z.looseObject({
    data: moneriumIbanUpdatedDataSchema,
    timestamp: moneriumTimestampSchema,
    type: z.literal("iban.updated")
  })
]) satisfies z.ZodType<MoneriumWebhookEvent>;
