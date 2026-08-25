/**
 * Fixed identifiers for the seeded sales-demo account. Every row the demo restore writes
 * carries one of these ids, so restore is idempotent and can never touch a real ramp,
 * recipient, or provider record created during a demo.
 *
 * See docs/operations-demo-environment.md.
 */

/** All demo-owned primary keys share this prefix. */
const DEMO_UUID_PREFIX = "d3ff0000-0000-4000-8000-";

function demoUuid(slot: number): string {
  return `${DEMO_UUID_PREFIX}${slot.toString().padStart(12, "0")}`;
}

/** The demo sender's business customer entity, used only when the profile has none yet. */
export const DEMO_SENDER_ENTITY_ID = demoUuid(1);

/** The corridor Florian onboards live. Wiped on every restore so it always starts fresh. */
export const DEMO_RESET_CORRIDOR = { country: "CO", provider: "alfredpay", rail: "cop" } as const;

/** The corridor with a real Avenia customer behind it. Restore never touches these rows. */
export const DEMO_REAL_CORRIDOR = { country: "BR", provider: "avenia", rail: "brl" } as const;

export interface DemoRecipientSeed {
  slot: number;
  alias: string;
  inviteeEmail: string;
  country: string;
  rail: string;
  payoutCurrency: string;
  /** Omitted for the invite-only row, which has no relationship or entity yet. */
  relationship?: {
    /** Present only when the recipient should read as "Approved" rather than "Pending review". */
    approved?: {
      instrumentType: "pix" | "clabe";
      maskedDisplayLabel: string;
    };
  };
}

/**
 * Four rows, deliberately mixed. A wall of identical "Approved" entries is what makes a
 * seeded account read as fake; the status vocabulary is part of the pitch.
 */
export const DEMO_RECIPIENTS: DemoRecipientSeed[] = [
  {
    alias: "Padaria Aurora LTDA",
    country: "BR",
    inviteeEmail: "financeiro@padaria-aurora.example",
    payoutCurrency: "BRL",
    rail: "brl",
    relationship: { approved: { instrumentType: "pix", maskedDisplayLabel: "••••4821" } },
    slot: 10
  },
  {
    alias: "Miguel Ortega Servicios",
    country: "MX",
    inviteeEmail: "pagos@ortega-servicios.example",
    payoutCurrency: "MXN",
    rail: "mxn",
    relationship: { approved: { instrumentType: "clabe", maskedDisplayLabel: "••••7390" } },
    slot: 11
  },
  {
    alias: "Andrea Rojas",
    country: "CO",
    inviteeEmail: "andrea.rojas@example.com",
    payoutCurrency: "COP",
    rail: "cop",
    relationship: {},
    slot: 12
  },
  {
    alias: "Estudio Belgrano SRL",
    country: "AR",
    inviteeEmail: "cobros@estudio-belgrano.example",
    payoutCurrency: "ARS",
    rail: "ars",
    slot: 13
  }
];

export const demoRecipientEntityId = (slot: number) => demoUuid(100 + slot);
export const demoInvitationId = (slot: number) => demoUuid(200 + slot);
export const demoSenderRecipientId = (slot: number) => demoUuid(300 + slot);
export const demoPayoutReferenceId = (slot: number) => demoUuid(400 + slot);
export const demoRecipientProviderCustomerId = (slot: number) => demoUuid(500 + slot);

export interface DemoTransactionSeed {
  slot: number;
  direction: "buy" | "sell";
  /** `complete` renders as completed; anything mid-flight renders as processing. */
  phase: "complete" | "brlaOnrampMint" | "brlaPayoutOnBase";
  inputAmount: string;
  inputCurrency: string;
  outputAmount: string;
  outputCurrency: string;
  /** How long before "now" the ramp was created; re-stamped on every restore so dates never rot. */
  ageMinutes: number;
}

/**
 * Two completed (one each direction, so payin and payout both appear) and two frozen at
 * processing. Pending rows are written with `presignedTxs = null`, which is what keeps
 * RampRecoveryWorker from picking them up and failing them ~15 minutes after seeding.
 */
export const DEMO_TRANSACTIONS: DemoTransactionSeed[] = [
  {
    ageMinutes: 60 * 26,
    direction: "buy",
    inputAmount: "5000.00",
    inputCurrency: "BRL",
    outputAmount: "912.44",
    outputCurrency: "USDC",
    phase: "complete",
    slot: 20
  },
  {
    ageMinutes: 60 * 8,
    direction: "sell",
    inputAmount: "1500.00",
    inputCurrency: "USDC",
    outputAmount: "8194.35",
    outputCurrency: "BRL",
    phase: "complete",
    slot: 21
  },
  {
    ageMinutes: 95,
    direction: "buy",
    inputAmount: "2400.00",
    inputCurrency: "BRL",
    outputAmount: "437.98",
    outputCurrency: "USDC",
    phase: "brlaOnrampMint",
    slot: 22
  },
  {
    ageMinutes: 20,
    direction: "sell",
    inputAmount: "750.00",
    inputCurrency: "USDC",
    outputAmount: "4097.18",
    outputCurrency: "BRL",
    phase: "brlaPayoutOnBase",
    slot: 23
  }
];

export const demoQuoteId = (slot: number) => demoUuid(600 + slot);
export const demoRampId = (slot: number) => demoUuid(700 + slot);
