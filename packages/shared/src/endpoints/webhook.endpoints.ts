import { RampDirection } from "../index";

export enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE",
  DEPOSIT_RECEIVED = "DEPOSIT_RECEIVED",
  DEPOSIT_CONVERTED = "DEPOSIT_CONVERTED"
}

/**
 * The account-scoped event family (business EUR onramp accounts). Subscriptions to
 * these events are registered without a quoteId/sessionId, cannot be mixed with the
 * transaction events in one webhook, and are delivered durably (at-least-once with
 * backoff) to the account's controlling manager.
 */
export const ACCOUNT_WEBHOOK_EVENT_TYPES = [WebhookEventType.DEPOSIT_RECEIVED, WebhookEventType.DEPOSIT_CONVERTED] as const;

export enum DepositStatus {
  PENDING = "pending",
  MINTED = "minted",
  HELD = "held",
  RETURNED = "returned"
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
 * How a whole execution was priced (docs/proposal-monerium-forwarder-fee-subsidy.md):
 * the partner reference it was settled against, the fee Vortex took above the target
 * band, and the subsidy the vault paid to reach the floor. Totals for the execution,
 * not per deposit; a deposit's own share is its `usdcNetRaw`.
 */
export interface ConversionExecutionPricing {
  /** Fee taken on the execution (6-decimal base units). */
  feeRaw: string | null;
  /** Reference EUR/USD rate the execution was priced against, in the oracle's decimals (8). */
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
    /** Aggregate net USDC attributed to the complete deposit (6-decimal base units). */
    usdcNetRaw: string;
  };
}

export type WebhookPayload =
  | TransactionCreatedWebhookPayload
  | StatusChangeWebhookPayload
  | DepositReceivedWebhookPayload
  | DepositConvertedWebhookPayload;

export interface WebhookDeliveryAttempt {
  webhookId: string;
  url: string;
  payload: WebhookPayload;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: Date;
}
