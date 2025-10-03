import { RampDirection, TransactionStatus, TransactionType, WebhookPayload } from "@packages/shared";
import crypto from "crypto";
import logger from "../../../config/logger";
import Webhook from "../../../models/webhook.model";
import webhookService from "./webhook.service";

export class WebhookDeliveryService {
  private readonly maxRetries = 5;
  private readonly timeoutMs = 30000;
  private readonly retryDelays = [1000, 2000, 4000, 8000, 16000];

  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  }

  private mapRampDirectionToTransactionType(rampDirection: RampDirection): TransactionType {
    return rampDirection === RampDirection.BUY ? "BUY" : "SELL";
  }

  private mapPhaseToStatus(phase: string): TransactionStatus {
    if (phase === "complete") return "COMPLETE";
    if (phase === "failed" || phase === "timedOut") return "FAILED";
    return "PENDING";
  }

  private async deliverWebhook(webhook: Webhook, payload: WebhookPayload, attempt = 1): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = this.generateSignature(payloadString, webhook.secret);
      const timestamp = Math.floor(Date.now() / 1000);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(webhook.url, {
        body: payloadString,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Vortex-Webhooks/1.0",
          "X-Vortex-Signature": `sha256=${signature}`,
          // The timestamp allows webhook receivers to validate request freshness and prevent replay attacks.
          // Recipients should verify the timestamp is within a reasonable window (e.g., 5 minutes)
          // and reject requests with timestamps too old or too far in the future.
          "X-Vortex-Timestamp": timestamp.toString()
        },
        method: "POST",
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.info(`Webhook delivered successfully: ${webhook.id} to ${webhook.url} (attempt ${attempt})`);
        return true;
      }

      logger.warn(`Webhook delivery failed: ${webhook.id} to ${webhook.url} - Status: ${response.status} (attempt ${attempt})`);
      return false;
    } catch (error) {
      logger.error(`Webhook delivery error: ${webhook.id} to ${webhook.url} (attempt ${attempt}):`, error);
      return false;
    }
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
    transactionId: string,
    sessionId: string | null,
    transactionType: RampDirection
  ): Promise<void> {
    try {
      const webhooks = await webhookService.findWebhooksForEvent("TRANSACTION_CREATED", transactionId, sessionId);

      if (webhooks.length === 0) {
        logger.debug(`No webhooks found for TRANSACTION_CREATED event: ${transactionId}`);
        return;
      }

      const payload: WebhookPayload = {
        eventType: "TRANSACTION_CREATED",
        payload: {
          sessionId,
          transactionId,
          transactionStatus: "PENDING",
          transactionType: this.mapRampDirectionToTransactionType(transactionType)
        },
        timestamp: new Date().toISOString()
      };

      const deliveryPromises = webhooks.map(webhook => this.deliverWithRetry(webhook, payload));
      await Promise.allSettled(deliveryPromises);

      logger.info(`Triggered TRANSACTION_CREATED webhooks for transaction: ${transactionId} (${webhooks.length} webhooks)`);
    } catch (error) {
      logger.error(`Error triggering TRANSACTION_CREATED webhooks for ${transactionId}:`, error);
    }
  }

  public async triggerStatusChange(
    transactionId: string,
    sessionId: string | null,
    newPhase: string,
    transactionType: RampDirection
  ): Promise<void> {
    try {
      const webhooks = await webhookService.findWebhooksForEvent("STATUS_CHANGE", transactionId, sessionId);

      if (webhooks.length === 0) {
        logger.debug(`No webhooks found for STATUS_CHANGE event: ${transactionId}`);
        return;
      }

      const payload: WebhookPayload = {
        eventType: "STATUS_CHANGE",
        payload: {
          sessionId,
          transactionId,
          transactionStatus: this.mapPhaseToStatus(newPhase),
          transactionType: this.mapRampDirectionToTransactionType(transactionType)
        },
        timestamp: new Date().toISOString()
      };

      const deliveryPromises = webhooks.map(webhook => this.deliverWithRetry(webhook, payload));
      await Promise.allSettled(deliveryPromises);

      logger.info(`Triggered STATUS_CHANGE webhooks for transaction: ${transactionId} (${webhooks.length} webhooks)`);
    } catch (error) {
      logger.error(`Error triggering STATUS_CHANGE webhooks for ${transactionId}:`, error);
    }
  }
}

export default new WebhookDeliveryService();
