import { randomUUID } from "node:crypto";
import { RampDirection, TransactionStatus, WebhookEventType, WebhookPayload } from "@vortexfi/shared";
import cryptoService from "../../../config/crypto";
import logger from "../../../config/logger";
import Webhook from "../../../models/webhook.model";
import { fetchWithTimeout } from "../../helpers/fetchWithTimeout";
import webhookService from "./webhook.service";
import { assertResolvesToPublicAddress } from "./webhook-url";

export class WebhookDeliveryService {
  private readonly maxRetries = 5;
  private readonly timeoutMs = 30000;
  private readonly retryDelays = [1000, 2000, 4000, 8000, 16000];

  // The signature covers the timestamp header, so a captured body+signature cannot be
  // replayed later with a fresh timestamp. Consumers verify over `${timestamp}.${body}`.
  private generateSignature(timestamp: number, payload: string): string {
    return cryptoService.signPayload(`${timestamp}.${payload}`);
  }

  private mapPhaseToStatus(phase: string): TransactionStatus {
    if (phase === "complete") return TransactionStatus.COMPLETE;
    if (phase === "failed" || phase === "timedOut") return TransactionStatus.FAILED;
    return TransactionStatus.PENDING;
  }

  /**
   * One signed delivery attempt with the SSRF re-resolution guard. Shared by the
   * legacy in-process retry loop and the durable outbox dispatcher, which owns its
   * own retry/backoff bookkeeping.
   */
  public async deliverSingleAttempt(webhook: Webhook, payload: WebhookPayload): Promise<{ ok: boolean; error: string | null }> {
    try {
      // Re-resolved on every attempt so a DNS record cannot be re-pointed at internal
      // infrastructure after registration (SSRF guard).
      await assertResolvesToPublicAddress(webhook.url);

      const payloadString = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(timestamp, payloadString);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetchWithTimeout(webhook.url, {
        body: payloadString,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Vortex-Webhooks/1.0",
          // Signature over `${timestamp}.${body}` (RSA-PSS, SHA-256). Recipients must
          // verify against that exact string, check the timestamp is within a bounded
          // window (e.g. 5 minutes), and deduplicate on the payload's eventId — it stays
          // stable across delivery retries, so a duplicate eventId outside a retry
          // window indicates a replay.
          "X-Vortex-Signature": signature,
          "X-Vortex-Timestamp": timestamp.toString()
        },
        method: "POST",
        // A public host must not be able to bounce the request to a private one.
        redirect: "error",
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { error: null, ok: true };
      }
      return { error: `HTTP ${response.status}`, ok: false };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false };
    }
  }

  private async deliverWebhook(webhook: Webhook, payload: WebhookPayload, attempt = 1): Promise<boolean> {
    const result = await this.deliverSingleAttempt(webhook, payload);
    if (result.ok) {
      logger.info(`Webhook delivered successfully: ${webhook.id} to ${webhook.url} (attempt ${attempt})`);
      return true;
    }
    logger.warn(`Webhook delivery failed: ${webhook.id} to ${webhook.url} - ${result.error} (attempt ${attempt})`);
    return false;
  }

  private async deliverWithRetry(webhook: Webhook, payload: WebhookPayload): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const success = await this.deliverWebhook(webhook, payload, attempt);

      if (success) {
        return;
      }

      if (attempt === this.maxRetries) {
        logger.error(`Webhook ${webhook.id} failed after ${this.maxRetries} attempts. Deactivating.`);
        await webhookService.deactivateWebhook(webhook.id);
        return;
      }

      const delay = this.retryDelays[attempt - 1] || this.retryDelays[this.retryDelays.length - 1];
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  public async triggerTransactionCreated(
    quoteId: string,
    sessionId: string | null,
    transactionId: string,
    transactionType: RampDirection
  ): Promise<void> {
    try {
      const webhooks = await webhookService.findWebhooksForEvent(WebhookEventType.TRANSACTION_CREATED, quoteId, sessionId);

      if (webhooks.length === 0) {
        logger.debug(`No webhooks found for TRANSACTION_CREATED event: ${quoteId}`);
        return;
      }

      const payload: WebhookPayload = {
        eventId: randomUUID(),
        eventType: WebhookEventType.TRANSACTION_CREATED,
        payload: {
          quoteId,
          sessionId,
          transactionId,
          transactionStatus: TransactionStatus.PENDING,
          transactionType: transactionType
        },
        timestamp: new Date().toISOString()
      };

      const deliveryPromises = webhooks.map(webhook => this.deliverWithRetry(webhook, payload));
      await Promise.allSettled(deliveryPromises);

      logger.info(`Triggered TRANSACTION_CREATED webhooks for quote: ${quoteId} (${webhooks.length} webhooks)`);
    } catch (error) {
      logger.error(`Error triggering TRANSACTION_CREATED webhooks for ${quoteId}:`, error);
    }
  }

  public async triggerStatusChange(
    quoteId: string,
    sessionId: string | null,
    transactionId: string,
    newPhase: string,
    transactionType: RampDirection
  ): Promise<void> {
    try {
      const webhooks = await webhookService.findWebhooksForEvent(WebhookEventType.STATUS_CHANGE, quoteId, sessionId);

      if (webhooks.length === 0) {
        logger.debug(`No webhooks found for STATUS_CHANGE event: ${quoteId}`);
        return;
      }

      const payload: WebhookPayload = {
        eventId: randomUUID(),
        eventType: WebhookEventType.STATUS_CHANGE,
        payload: {
          quoteId,
          sessionId,
          transactionId,
          transactionStatus: this.mapPhaseToStatus(newPhase),
          transactionType: transactionType
        },
        timestamp: new Date().toISOString()
      };

      const deliveryPromises = webhooks.map(webhook => this.deliverWithRetry(webhook, payload));
      await Promise.allSettled(deliveryPromises);

      logger.info(`Triggered STATUS_CHANGE webhooks for quote: ${quoteId} (${webhooks.length} webhooks)`);
    } catch (error) {
      logger.error(`Error triggering STATUS_CHANGE webhooks for ${quoteId}:`, error);
    }
  }
}

export default new WebhookDeliveryService();
