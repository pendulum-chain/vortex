import { RampDirection } from "../index";

export enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE",
  DEPOSIT_RECEIVED = "DEPOSIT_RECEIVED",
  DEPOSIT_CONVERTED = "DEPOSIT_CONVERTED",
  DEPOSIT_RETURNED = "DEPOSIT_RETURNED",
  /** Every change of a deposit: the full snapshot, as returned by the deposits endpoint. */
  DEPOSIT_UPDATED = "DEPOSIT_UPDATED",
  /** Every change of an onramp account (IBAN issued, status): the full account snapshot. */
  ACCOUNT_UPDATED = "ACCOUNT_UPDATED"
}

/**
 * The account-scoped event family (business EUR onramp accounts). Subscriptions to
 * these events are registered without a quoteId/sessionId, cannot be mixed with the
 * transaction events in one webhook, and are delivered durably (at-least-once with
 * backoff) to the account's controlling manager.
 */
export const ACCOUNT_WEBHOOK_EVENT_TYPES = [
  WebhookEventType.DEPOSIT_RECEIVED,
  WebhookEventType.DEPOSIT_CONVERTED,
  WebhookEventType.DEPOSIT_RETURNED,
  WebhookEventType.DEPOSIT_UPDATED,
  WebhookEventType.ACCOUNT_UPDATED
] as const;

export enum DepositStatus {
  /** Provider order placed, EURe not minted yet. */
  PENDING = "pending",
  /** EURe minted to the forwarder. */
  MINTED = "minted",
  /** Provider compliance hold before the mint. */
  HELD = "held",
  /** The provider returned the payment before the mint. Terminal. */
  RETURNED = "returned",
  /** Conversion started; chunks accumulate on the forwarder until the whole deposit is converted. */
  CONVERTING = "converting",
  /** The whole converted deposit reached the destination in one transfer. Terminal. */
  FORWARDED = "forwarded",
  /** The deposit could not be converted inside the promised window; Vortex is refunding the payer. */
  RECOVERING = "recovering",
  /** The exact EUR amount was refunded to the payer's bank account. Terminal. */
  REFUNDED = "refunded",
  /** The refund needs operator intervention. */
  RECOVERY_FAILED = "recovery_failed"
}

export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED"
}

export interface RegisterWebhookRequest {
  url: string;
  quoteId?: string;
  sessionId?: string;
  events?: WebhookEventType[];
}

export interface RegisterWebhookResponse {
  id: string;
  url: string;
  quoteId: string | null;
  sessionId: string | null;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
}

export interface DeleteWebhookRequest {
  id: string;
}

export interface DeleteWebhookResponse {
  success: boolean;
  message: string;
}

export interface WebhookPayloadBase {
  quoteId: string;
  sessionId: string | null;
  transactionId: string;
  transactionStatus: TransactionStatus;
  transactionType: RampDirection;
}

export interface TransactionCreatedWebhookPayload {
  /** Unique per event and stable across delivery retries — consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.TRANSACTION_CREATED;
  timestamp: string;
  payload: WebhookPayloadBase;
}

export interface StatusChangeWebhookPayload {
  /** Unique per event and stable across delivery retries — consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.STATUS_CHANGE;
  timestamp: string;
  payload: WebhookPayloadBase;
}

export interface DepositWebhookPayloadBase {
  /** The onramp account the deposit belongs to. */
  accountId: string;
  /** The managed child profile that owns the account. */
  profileId: string;
  depositId: string;
  /** Deposit amount in 18-decimal base units of the deposit currency. */
  amountRaw: string;
  currency: string;
  status: DepositStatus;
  /** The on-chain mint transaction, when observed. */
  txHash: string | null;
}

export interface DepositReceivedWebhookPayload {
  /** Unique per event and stable across delivery retries — consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.DEPOSIT_RECEIVED;
  timestamp: string;
  payload: DepositWebhookPayloadBase;
}

/**
 * How one conversion chunk was priced (docs/architecture-monerium-b2b-onramp.md, fees
 * section): the reference it was settled against, the fee Vortex took above the target,
 * and the subsidy the vault paid to reach the floor. Every chunk belongs to exactly one
 * deposit.
 */
export interface ConversionExecutionPricing {
  /** Fee taken on the execution (6-decimal base units). */
  feeRaw: string | null;
  /** Reference EUR/USD rate the execution was priced against: the Coinbase Exchange EURC-USDC bid/ask midpoint read just before the swap, in the oracle's decimals (8). */
  referenceRateRaw: string | null;
  /** Subsidy the vault paid onto the forwarder for this chunk (6-decimal base units). */
  subsidyRaw: string | null;
}

export interface DepositConvertedWebhookPayload {
  /** Unique per event and stable across delivery retries — consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.DEPOSIT_CONVERTED;
  timestamp: string;
  payload: DepositWebhookPayloadBase & {
    /** Every confirmed conversion portion that consumed this deposit, oldest first. */
    conversions: Array<{
      /** EURe from this deposit consumed by this execution (18-decimal base units). */
      eureInRaw: string;
      /** How this chunk was priced. */
      execution: ConversionExecutionPricing;
      executionId: string;
      /** The chunk's swap transaction. */
      txHash: string | null;
      /** Net USDC from this chunk after fee and subsidy (6-decimal base units). */
      usdcNetRaw: string;
    }>;
    /** The single transaction that pushed the whole converted deposit to the destination. */
    forwardTxHash: string | null;
    /** Aggregate net USDC forwarded for the complete deposit (6-decimal base units). */
    usdcNetRaw: string;
  };
}

/** A deposit that could not be converted inside the promised window was refunded to the payer's bank account. */
export interface DepositReturnedWebhookPayload {
  /** Unique per event and stable across delivery retries — consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.DEPOSIT_RETURNED;
  timestamp: string;
  payload: DepositWebhookPayloadBase & {
    refund: {
      /** The EUR amount refunded, to the cent ("1234.56"): always the full issue amount. */
      amount: string;
      /** The payer's IBAN the refund went to, masked to its first and last four characters. */
      payerIbanMasked: string;
      /** Monerium's redeem order id for the refund, when known. */
      redeemOrderId: string | null;
      /** The on-chain transaction that moved the deposit off the forwarding contract for the refund. */
      recoverTxHash: string | null;
    };
  };
}

/**
 * Why a deposit is waiting: `monerium_pending` until Monerium mints it (minting or a
 * compliance review, which Monerium does not tell apart), `account_not_active` while the
 * account cannot convert (not activated yet, suspended, or paused for dormancy),
 * `below_minimum` while the unconverted amount is below the minimum swap (it waits for the
 * refund path and holds back no later deposit), otherwise the reason the keeper is holding
 * the next conversion chunk.
 */
export type DepositWaitingReason =
  | "monerium_pending"
  | "account_not_active"
  | "oracle_unavailable"
  | "reference_unavailable"
  | "reference_out_of_band"
  | "no_route"
  | "below_floor"
  | "below_minimum";

/** Why a deposit entered the refund path. */
export type DepositRefundReason = "window_missed" | "compliance" | "incident" | "operator";

/** One conversion chunk of a deposit. Timestamps are ISO 8601. */
export interface DepositConversionSnapshot {
  executionId: string;
  status: "pending" | "confirmed";
  /** EURe converted by this chunk (18-decimal base units). */
  eureInRaw: string;
  execution: ConversionExecutionPricing;
  /** Net USDC from this chunk after fee and subsidy (6-decimal base units). */
  usdcNetRaw: string;
  txHash: string | null;
  sentAt: string;
  confirmedAt: string | null;
}

/** The full state of one deposit, as sent by DEPOSIT_UPDATED and returned by the deposits endpoint. */
export interface DepositSnapshot {
  depositId: string;
  accountId: string;
  /** The client's Vortex managed profile, the `X-Managed-Profile-Id` value. */
  profileId: string;
  moneriumProfileId: string;
  moneriumOrderId: string;
  /** The partner's own client reference for this managed profile. */
  externalSubjectId: string | null;
  status: DepositStatus;
  currency: string;
  /** EUR amount to the cent, for example "1234.56". */
  amount: string;
  /** EUR amount in 18-decimal base units. */
  amountRaw: string;
  /** The on-chain mint transaction, when observed. */
  txHash: string | null;
  /** When Vortex first saw the payment. */
  receivedAt: string;
  mintedAt: string | null;
  /** Present while the deposit waits, before the mint or between conversion chunks. */
  waiting: { reason: DepositWaitingReason; since: string } | null;
  /** Monerium's reason when it returned the payment before minting. */
  rejectedReason: string | null;
  conversions: DepositConversionSnapshot[];
  /** Net USDC of the confirmed chunks (6-decimal base units). */
  usdcNetRaw: string;
  /** The single transfer of the whole converted deposit to the destination. */
  forwardTxHash: string | null;
  deliveredAt: string | null;
  /** Present once the deposit entered the refund path. */
  refund: {
    reason: DepositRefundReason | null;
    /** The EUR amount refunded, to the cent: always the full issue amount. */
    amount: string | null;
    payerIbanMasked: string | null;
    recoverTxHash: string | null;
    redeemOrderId: string | null;
    startedAt: string | null;
    refundedAt: string | null;
  } | null;
}

/** The state of one onramp account, as sent by ACCOUNT_UPDATED and returned by the account endpoints. */
export interface AccountSnapshot {
  accountId: string;
  /** The client's Vortex managed profile, the `X-Managed-Profile-Id` value. */
  profileId: string | null;
  moneriumProfileId: string;
  externalSubjectId: string | null;
  status: string;
  /** Null until Monerium issued it. */
  iban: string | null;
  destination: string;
  forwarderAddress: string;
  targetPpm: number;
  floorPpm: number;
  dormantSince: string | null;
  createdAt: string;
}

export interface DepositUpdatedWebhookPayload {
  /** Unique per snapshot and stable across delivery retries: consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.DEPOSIT_UPDATED;
  timestamp: string;
  payload: DepositSnapshot;
}

export interface AccountUpdatedWebhookPayload {
  /** Unique per snapshot and stable across delivery retries: consumers deduplicate on it. */
  eventId: string;
  eventType: WebhookEventType.ACCOUNT_UPDATED;
  timestamp: string;
  payload: AccountSnapshot;
}

export type WebhookPayload =
  | TransactionCreatedWebhookPayload
  | StatusChangeWebhookPayload
  | DepositReceivedWebhookPayload
  | DepositConvertedWebhookPayload
  | DepositReturnedWebhookPayload
  | DepositUpdatedWebhookPayload
  | AccountUpdatedWebhookPayload;

export interface WebhookDeliveryAttempt {
  webhookId: string;
  url: string;
  payload: WebhookPayload;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: Date;
}
