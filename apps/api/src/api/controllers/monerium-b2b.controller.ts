import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { APIError } from "../errors/api-error";
import { processMoneriumWebhookInbox } from "../services/monerium-b2b/deposit-processor";
import {
  deriveEventId,
  MONERIUM_SIGNATURE_HEADER,
  recordWebhookEvent,
  verifyWebhookSignature
} from "../services/monerium-b2b/webhook";

/**
 * POST /v1/monerium-b2b/webhook — durable-inbox webhook receiver (plan §3, R06).
 * Order of operations is load-bearing: HMAC over the RAW bytes first, then persist the
 * delivery (dedup on event id), and only then 200. Processing happens asynchronously
 * after the response — Monerium retries are absorbed by the inbox dedup.
 */
export const handleWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = config.moneriumB2b.webhookSecret;
    if (!secret) {
      throw new APIError({ message: "Monerium B2B webhook secret is not configured", status: httpStatus.SERVICE_UNAVAILABLE });
    }

    // Raw bytes captured by the body-parser verify hook in config/express.ts.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyWebhookSignature(rawBody, req.header(MONERIUM_SIGNATURE_HEADER), secret)) {
      throw new APIError({ message: "Invalid webhook signature", status: httpStatus.UNAUTHORIZED });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new APIError({ message: "Webhook payload is not valid JSON", status: httpStatus.BAD_REQUEST });
    }

    await recordWebhookEvent(deriveEventId(rawBody, payload), payload);
    res.status(httpStatus.OK).json({ received: true });

    setImmediate(() => {
      processMoneriumWebhookInbox().catch(error => {
        logger.error("monerium-b2b: async webhook inbox processing failed:", error);
      });
    });
  } catch (error) {
    next(error);
  }
};
