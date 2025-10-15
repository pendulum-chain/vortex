import { RampDirection } from "@packages/shared";

export enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE"
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
  eventType: WebhookEventType.TRANSACTION_CREATED;
  timestamp: string;
  payload: WebhookPayloadBase;
}

export interface StatusChangeWebhookPayload {
  eventType: WebhookEventType.STATUS_CHANGE;
  timestamp: string;
  payload: WebhookPayloadBase;
}

export type WebhookPayload = TransactionCreatedWebhookPayload | StatusChangeWebhookPayload;

export interface WebhookDeliveryAttempt {
  webhookId: string;
  url: string;
  payload: WebhookPayload;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: Date;
}
