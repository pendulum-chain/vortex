import { z } from "zod";

/**
 * External API contract schemas for Relay (see docs/operations-testing.md): the raw wire JSON of
 * the consumed fields of POST /quote/v2 and GET /intents/status/v3. Unknown extra fields pass; a
 * removed or renamed consumed field fails. Chain names that select an address encoding are limited
 * to the two the corridor uses, because the order id port only covers EVM chains.
 */

const RAW_UNITS = z.string().regex(/^\d+$/);
const EVM_ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const HEX_BYTES = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const BYTES32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const CHAIN_NAME = z.enum(["base", "robinhood"]);

const relayTransactionSchema = z.looseObject({
  chainId: z.number().int(),
  data: HEX_BYTES,
  from: EVM_ADDRESS,
  // Relay omits gas on some deposit modes. The deposit validators reject its absence where it matters.
  gas: RAW_UNITS.optional(),
  maxFeePerGas: RAW_UNITS.optional(),
  maxPriorityFeePerGas: RAW_UNITS.optional(),
  to: EVM_ADDRESS,
  value: RAW_UNITS
});

const relayStepSchema = z.looseObject({
  depositAddress: z.string().optional(),
  id: z.string().min(1),
  items: z.array(z.looseObject({ data: relayTransactionSchema })),
  kind: z.string(),
  requestId: BYTES32
});

const relayCurrencyAmountSchema = z.looseObject({
  amount: RAW_UNITS,
  amountUsd: z.string(),
  minimumAmount: RAW_UNITS
});

const relayOrderRefundSchema = z.looseObject({
  chainId: CHAIN_NAME,
  currency: EVM_ADDRESS,
  deadline: z.number().int(),
  extraData: HEX_BYTES,
  minimumAmount: RAW_UNITS,
  recipient: EVM_ADDRESS
});

const relayOrderPaymentSchema = z.looseObject({
  currency: EVM_ADDRESS,
  expectedAmount: RAW_UNITS,
  minimumAmount: RAW_UNITS,
  recipient: EVM_ADDRESS
});

const relayOrderFeeSchema = z.looseObject({
  amount: RAW_UNITS,
  currency: EVM_ADDRESS,
  currencyChainId: CHAIN_NAME,
  recipient: EVM_ADDRESS,
  recipientChainId: CHAIN_NAME
});

export const relayOrderDataSchema = z.looseObject({
  fees: z.array(relayOrderFeeSchema),
  inputs: z.array(
    z.looseObject({
      payment: z.looseObject({ amount: RAW_UNITS, chainId: CHAIN_NAME, currency: EVM_ADDRESS, weight: RAW_UNITS }),
      refunds: z.array(relayOrderRefundSchema)
    })
  ),
  output: z.looseObject({
    calls: z.array(HEX_BYTES),
    chainId: CHAIN_NAME,
    deadline: z.number().int(),
    extraData: HEX_BYTES,
    payments: z.array(relayOrderPaymentSchema)
  }),
  salt: z.string().regex(/^(?:\d+|0x[0-9a-fA-F]+)$/),
  solver: EVM_ADDRESS,
  solverChainId: z.string(),
  version: z.string()
});

export const relayQuoteSchema = z.looseObject({
  details: z.looseObject({
    currencyIn: relayCurrencyAmountSchema,
    currencyOut: relayCurrencyAmountSchema,
    totalImpact: z.looseObject({ usd: z.string() })
  }),
  protocol: z.looseObject({
    v2: z.looseObject({
      orderData: relayOrderDataSchema,
      orderId: BYTES32,
      orderSignature: HEX_BYTES.optional(),
      paymentDetails: z.looseObject({
        amount: RAW_UNITS,
        chainId: CHAIN_NAME,
        currency: EVM_ADDRESS,
        depository: EVM_ADDRESS
      })
    })
  }),
  requestId: BYTES32,
  steps: z.array(relayStepSchema)
});

/** `unknown` is the live answer for an id Relay has not seen. It is absent from Relay's own schema enum. */
export const RELAY_INTENT_STATUSES = [
  "waiting",
  "depositing",
  "pending",
  "submitted",
  "success",
  "failure",
  "refund",
  "unknown"
] as const;

// Relay reports "N/A" on requests that have no failure, which must not read as a failure reason.
const relayFailureReasonSchema = z
  .string()
  .nullish()
  .transform(reason => (reason && reason !== "N/A" ? reason : undefined));

export const relayIntentStatusSchema = z.looseObject({
  failReason: relayFailureReasonSchema,
  inTxHashes: z.array(z.string()).default([]),
  refundFailReason: relayFailureReasonSchema,
  status: z.enum(RELAY_INTENT_STATUSES),
  txHashes: z.array(z.string()).default([])
});

export type RelayOrderData = z.infer<typeof relayOrderDataSchema>;
export type RelayQuote = z.infer<typeof relayQuoteSchema>;
export type RelayIntentStatus = z.infer<typeof relayIntentStatusSchema>;
