import { RampDirection } from "../index";

export enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE",
  DEPOSIT_RECEIVED = "DEPOSIT_RECEIVED",
  DEPOSIT_CONVERTED = "DEPOSIT_CONVERTED",
  DEPOSIT_RETURNED = "DEPOSIT_RETURNED"
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
  WebhookEventType.DEPOSIT_RETURNED
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
 * How a whole execution was priced (docs/architecture-monerium-b2b-onramp.md, fees section):
 * the partner reference it was settled against, the fee Vortex took above the target
 * band, and the subsidy the vault paid to reach the floor. Totals for the execution,
 * not per deposit; a deposit's own share is its `usdcNetRaw`.
 */
export interface ConversionExecutionPricing {
  /** Fee taken on the execution (6-decimal base units). */
  feeRaw: string | null;
  /** Reference EUR/USD rate the execution was priced against: the Coinbase Exchange EURC-USDC bid/ask midpoint read just before the swap, in the oracle's decimals (8). */
  referenceRateRaw: string | null;
  /** Subsidy paid by the vault straight to the destination (6-decimal base units). */
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
      /** Execution-level pricing shared by every deposit portion the execution consumed. */
      execution: ConversionExecutionPricing;
      executionId: string;
      /** The swap-and-forward transaction. */
      txHash: string | null;
      /** Net USDC from this execution attributed to this deposit (6-decimal base units). */
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

export type WebhookPayload =
  | TransactionCreatedWebhookPayload
  | StatusChangeWebhookPayload
  | DepositReceivedWebhookPayload
  | DepositConvertedWebhookPayload
  | DepositReturnedWebhookPayload;

export interface WebhookDeliveryAttempt {
  webhookId: string;
  url: string;
  payload: WebhookPayload;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: Date;
}
