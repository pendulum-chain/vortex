import { RegisterWebhookRequest, RegisterWebhookResponse, WebhookEventType } from "@vortexfi/shared";
import httpStatus from "http-status";
import { Op, WhereOptions } from "sequelize";
import logger from "../../../config/logger";
import QuoteTicket from "../../../models/quoteTicket.model";
import Webhook from "../../../models/webhook.model";
import { APIError } from "../../errors/api-error";
import { getWebhookUrlViolation } from "./webhook-url";

/**
 * Principal that owns a webhook: the partner behind a partner-scoped secret key,
 * or the user behind a user-scoped secret key. Exactly one side is set.
 */
export interface WebhookOwner {
  partnerId: string | null;
  userId: string | null;
}

export class WebhookService {
  public async registerWebhook(request: RegisterWebhookRequest, owner: WebhookOwner): Promise<RegisterWebhookResponse> {
    try {
      const { url, quoteId, sessionId, events } = request;

      if (!owner.partnerId && !owner.userId) {
        throw new APIError({
          message: "API key is not linked to a partner or user",
          status: httpStatus.FORBIDDEN
        });
      }

      // Validate URL format
      if (!url) {
        throw new APIError({
          message: "URL is required",
          status: httpStatus.BAD_REQUEST
        });
      }

      const urlViolation = getWebhookUrlViolation(url);
      if (urlViolation) {
        throw new APIError({
          message: urlViolation,
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

      // The quote must exist AND belong to the registering principal. A foreign quote
      // returns the same 404 as a nonexistent one so quote IDs cannot be probed.
      if (quoteId) {
        const existingQuote = await QuoteTicket.findByPk(quoteId);
        const ownsQuote =
          existingQuote &&
          (owner.partnerId ? existingQuote.partnerId === owner.partnerId : existingQuote.userId === owner.userId);
        if (!ownsQuote) {
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
        partnerId: owner.partnerId,
        quoteId: quoteId || null,
        sessionId: sessionId || null,
        url,
        userId: owner.partnerId ? null : owner.userId
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

  public async deleteWebhook(id: string, owner: WebhookOwner): Promise<boolean> {
    try {
      if (!owner.partnerId && !owner.userId) {
        return false;
      }

      // Owner-scoped: a webhook belonging to another principal behaves exactly like a
      // nonexistent one (uniform 404 upstream).
      const ownerCondition: WhereOptions = owner.partnerId ? { partnerId: owner.partnerId } : { userId: owner.userId };
      const webhook = await Webhook.findOne({ where: { id, ...ownerCondition } });

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
   * Find webhooks that should receive a specific event.
   *
   * Target matching (quote/session/global) is combined with an owner filter: a webhook
   * only receives the event if its owner principal owns the quote the event belongs to.
   * This keeps session IDs (free-form strings) from leaking events across tenants.
   * Legacy rows without an owner keep receiving events.
   */
  public async findWebhooksForEvent(
    eventType: WebhookEventType,
    quoteId: string,
    sessionId?: string | null
  ): Promise<Webhook[]> {
    try {
      const targetConditions: WhereOptions[] = [];

      // Match webhooks subscribed to this specific quote
      if (quoteId) {
        targetConditions.push({ quoteId });
      }

      // Match webhooks subscribed to this specific session
      if (sessionId) {
        targetConditions.push({ sessionId });
      }

      // Match webhooks with no specific quote or session (global webhooks)
      targetConditions.push({
        quoteId: null,
        sessionId: null
      });

      const quote = quoteId ? await QuoteTicket.findByPk(quoteId, { attributes: ["partnerId", "userId"] }) : null;
      const ownerConditions: WhereOptions[] = [{ partnerId: null, userId: null }];
      if (quote?.partnerId) {
        ownerConditions.push({ partnerId: quote.partnerId });
      }
      if (quote?.userId) {
        ownerConditions.push({ userId: quote.userId });
      }

      const webhooks = await Webhook.findAll({
        where: {
          [Op.and]: [{ [Op.or]: targetConditions }, { [Op.or]: ownerConditions }],
          events: {
            [Op.contains]: [eventType]
          },
          isActive: true
        }
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
