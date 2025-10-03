export type WebhookEventType = "TRANSACTION_CREATED" | "STATUS_CHANGE";

export type TransactionStatus = "PENDING" | "COMPLETE" | "FAILED";

export type TransactionType = "BUY" | "SELL";

export interface RegisterWebhookRequest {
  url: string;
  transactionId?: string;
  sessionId?: string;
  events?: WebhookEventType[];
}

export interface RegisterWebhookResponse {
  id: string;
  url: string;
  transactionId: string | null;
  sessionId: string | null;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
  secret: string; // The webhook secret is returned only during registration
}

export interface DeleteWebhookRequest {
  id: string;
}

export interface DeleteWebhookResponse {
  success: boolean;
  message: string;
}

export interface WebhookPayloadBase {
  transactionId: string;
  sessionId: string | null;
  transactionStatus: TransactionStatus;
  transactionType: TransactionType;
}

export interface TransactionCreatedWebhookPayload {
  eventType: "TRANSACTION_CREATED";
  timestamp: string;
  payload: WebhookPayloadBase;
}

export interface StatusChangeWebhookPayload {
  eventType: "STATUS_CHANGE";
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
