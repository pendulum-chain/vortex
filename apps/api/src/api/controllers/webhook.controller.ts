import { DeleteWebhookRequest, DeleteWebhookResponse, RegisterWebhookRequest, RegisterWebhookResponse } from "@packages/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { APIError } from "../errors/api-error";
import webhookService from "../services/webhook/webhook.service";

/**
 * Register a new webhook
 * @public
 */
export const registerWebhook = async (
  req: Request<unknown, unknown, RegisterWebhookRequest>,
  res: Response<RegisterWebhookResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { url, transactionId, sessionId, events } = req.body;

    // Validate required fields
    if (!url) {
      throw new APIError({
        message: "URL is required",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Validate URL format
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== "https:") {
        throw new APIError({
          message: "Webhook URL must use HTTPS",
          status: httpStatus.BAD_REQUEST
        });
      }
    } catch {
      throw new APIError({
        message: "Invalid URL format",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Validate that at least one subscription target is provided
    if (!transactionId && !sessionId) {
      throw new APIError({
        message: "Either transactionId or sessionId must be provided",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Register webhook
    const webhook = await webhookService.registerWebhook({
      events,
      sessionId,
      transactionId,
      url
    });

    res.status(httpStatus.CREATED).json(webhook);
  } catch (error) {
    logger.error("Error registering webhook:", error);
    next(error);
  }
};

/**
 * Delete a webhook
 * @public
 */
export const deleteWebhook = async (
  req: Request<DeleteWebhookRequest>,
  res: Response<DeleteWebhookResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new APIError({
        message: "Webhook ID is required",
        status: httpStatus.BAD_REQUEST
      });
    }

    const success = await webhookService.deleteWebhook(id);

    if (!success) {
      throw new APIError({
        message: "Webhook not found",
        status: httpStatus.NOT_FOUND
      });
    }

    res.status(httpStatus.OK).json({
      message: "Webhook deleted successfully",
      success: true
    });
  } catch (error) {
    logger.error("Error deleting webhook:", error);
    next(error);
  }
};
