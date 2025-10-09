import { RegisterWebhookRequest, RegisterWebhookResponse, WebhookEventType } from "@packages/shared";
import httpStatus from "http-status";
import { Op, WhereOptions } from "sequelize";
import logger from "../../../config/logger";
import QuoteTicket from "../../../models/quoteTicket.model";
import Webhook from "../../../models/webhook.model";
import { APIError } from "../../errors/api-error";

export class WebhookService {
  public async registerWebhook(request: RegisterWebhookRequest): Promise<RegisterWebhookResponse> {
    try {
      const { url, quoteId, sessionId, events } = request;

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
        const validEventTypes: WebhookEventType[] = Object.values(WebhookEventType);
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

      // Validate that at least one of quoteId or sessionId is provided
      if (!quoteId && !sessionId) {
        throw new APIError({
          message: "Either quoteId or sessionId must be provided",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Validate that quoteId exists in the database if provided
      if (quoteId) {
        const existingQuote = await QuoteTicket.findByPk(quoteId);
        if (!existingQuote) {
          throw new APIError({
            message: `Quote with ID ${quoteId} not found`,
            status: httpStatus.NOT_FOUND
          });
        }
      }

      const webhookEvents: WebhookEventType[] = events || Object.values(WebhookEventType);

      const webhook = await Webhook.create({
        events: webhookEvents,
        isActive: true,
        quoteId: quoteId || null,
        sessionId: sessionId || null,
        url
      });

      logger.info(`Webhook registered: ${webhook.id} for URL: ${url}`);

      return {
        createdAt: webhook.createdAt.toISOString(),
        events: webhook.events,
        id: webhook.id,
        isActive: webhook.isActive,
        quoteId: webhook.quoteId,
        sessionId: webhook.sessionId,
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
    quoteId: string,
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

      // Match webhooks subscribed to this specific quote
      if (quoteId) {
        orConditions.push({ quoteId });
      }

      // Match webhooks subscribed to this specific session
      if (sessionId) {
        orConditions.push({ sessionId });
      }

      // Match webhooks with no specific quote or session (global webhooks)
      orConditions.push({
        quoteId: null,
        sessionId: null
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
