import { RegisterWebhookRequest, RegisterWebhookResponse, WebhookEventType } from "@packages/shared";
import crypto from "crypto";
import httpStatus from "http-status";
import { Op, WhereOptions } from "sequelize";
import logger from "../../../config/logger";
import Webhook from "../../../models/webhook.model";
import { APIError } from "../../errors/api-error";

export class WebhookService {
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public async registerWebhook(request: RegisterWebhookRequest): Promise<RegisterWebhookResponse> {
    try {
      const { url, transactionId, sessionId, events } = request;

      // Validate URL format
      if (!url) {
        throw new APIError({
          message: "URL is required",
          status: httpStatus.BAD_REQUEST
        });
      }

      if (!url.startsWith("https://")) {
        throw new APIError({
          message: "Webhook URL must use HTTPS",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Validate events if provided
      if (events) {
        const validEventTypes: WebhookEventType[] = ["TRANSACTION_CREATED", "STATUS_CHANGE"];
        const invalidEvents = events.filter(event => !validEventTypes.includes(event));

        if (invalidEvents.length > 0) {
          throw new APIError({
            message: `Invalid event type(s): ${invalidEvents.join(", ")}. The allowed event types are ${validEventTypes.join(", ")}`,
            status: httpStatus.BAD_REQUEST
          });
        }

        if (events.length === 0) {
          throw new APIError({
            message: "At least one event type must be specified",
            status: httpStatus.BAD_REQUEST
          });
        }
      }

      // Validate that at least one of transactionId or sessionId is provided
      if (!transactionId && !sessionId) {
        throw new APIError({
          message: "Either transactionId or sessionId must be provided",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Generate a secure secret for HMAC signing
      const secret = this.generateWebhookSecret();

      const webhookEvents: WebhookEventType[] = events || ["TRANSACTION_CREATED", "STATUS_CHANGE"];

      const webhook = await Webhook.create({
        events: webhookEvents,
        isActive: true,
        secret,
        sessionId: sessionId || null,
        transactionId: transactionId || null,
        url
      });

      logger.info(`Webhook registered: ${webhook.id} for URL: ${url}`);

      return {
        createdAt: webhook.createdAt.toISOString(),
        events: webhook.events,
        id: webhook.id,
        isActive: webhook.isActive,
        sessionId: webhook.sessionId,
        transactionId: webhook.transactionId,
        url: webhook.url
      };
    } catch (error: unknown) {
      logger.error("Error registering webhook:", error);

      if (error instanceof APIError) {
        throw error;
      }

      // Generic error fallback
      throw new APIError({
        message: "Failed to register webhook",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }
  }

  public async deleteWebhook(id: string): Promise<boolean> {
    try {
      const webhook = await Webhook.findByPk(id);

      if (!webhook) {
        return false;
      }

      await webhook.destroy();
      logger.info(`Webhook deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error("Error deleting webhook:", error);
      throw new APIError({
        message: "Failed to delete webhook",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }
  }

  /**
   * Find webhooks that should receive a specific event
   */
  public async findWebhooksForEvent(
    eventType: WebhookEventType,
    transactionId: string,
    sessionId?: string | null
  ): Promise<Webhook[]> {
    try {
      const whereConditions: WhereOptions = {
        events: {
          [Op.contains]: [eventType]
        },
        isActive: true
      };

      const orConditions: WhereOptions[] = [];

      // Match webhooks subscribed to this specific transaction
      if (transactionId) {
        orConditions.push({ transactionId });
      }

      // Match webhooks subscribed to this specific session
      if (sessionId) {
        orConditions.push({ sessionId });
      }

      // Match webhooks with no specific transaction or session (global webhooks)
      orConditions.push({
        sessionId: null,
        transactionId: null
      });

      if (orConditions.length > 0) {
        whereConditions[Op.or as unknown as string] = orConditions;
      }

      const webhooks = await Webhook.findAll({
        where: whereConditions
      });

      return webhooks;
    } catch (error) {
      logger.error("Error finding webhooks for event:", error);
      return [];
    }
  }

  /**
   * Get webhook by ID (including secret for internal use)
   */
  public async getWebhookById(id: string): Promise<Webhook | null> {
    try {
      return await Webhook.findByPk(id);
    } catch (error) {
      logger.error("Error getting webhook by ID:", error);
      return null;
    }
  }

  /**
   * Deactivate a webhook (useful for failed deliveries)
   */
  public async deactivateWebhook(id: string): Promise<boolean> {
    try {
      const webhook = await Webhook.findByPk(id);

      if (!webhook) {
        return false;
      }

      await webhook.update({ isActive: false });
      logger.info(`Webhook deactivated: ${id}`);
      return true;
    } catch (error) {
      logger.error("Error deactivating webhook:", error);
      return false;
    }
  }
}

export default new WebhookService();
