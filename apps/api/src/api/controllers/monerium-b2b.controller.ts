import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import MoneriumAccount from "../../models/moneriumAccount.model";
import MoneriumConversionExecution from "../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit from "../../models/moneriumFiatDeposit.model";
import { APIError } from "../errors/api-error";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { processMoneriumWebhookInbox } from "../services/monerium-b2b/deposit-processor";
import { UNATTRIBUTED_ORDER_PREFIX } from "../services/monerium-b2b/mint-watcher";
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

async function findAccountForEffectiveUser(req: Request): Promise<MoneriumAccount | null> {
  const effectiveUserId = getEffectiveUserId(req);
  if (!effectiveUserId) return null;
  return MoneriumAccount.findOne({ where: { vortexProfileId: effectiveUserId } });
}

function accountNotFound(res: Response): void {
  res.status(httpStatus.NOT_FOUND).json({
    error: {
      code: "MONERIUM_B2B_ACCOUNT_NOT_FOUND",
      message: "No Monerium account exists for the acting profile",
      status: httpStatus.NOT_FOUND
    }
  });
}

/**
 * GET /v1/monerium-b2b/account — the acting profile's onramp account. Scoped strictly
 * to the effective user (manager delegation header or the child's own credential); no
 * caller-supplied account or profile identifier is accepted.
 */
export const getMoneriumB2bAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await findAccountForEffectiveUser(req);
    if (!account) {
      accountNotFound(res);
      return;
    }
    res.status(httpStatus.OK).json({
      account: {
        accountId: account.id,
        createdAt: account.createdAt,
        destination: account.destination,
        dormantSince: account.dormantSince,
        fallbackAddress: account.fallbackAddress,
        feeBps: account.feeBps,
        forwarderAddress: account.forwarderAddress,
        iban: account.iban,
        status: account.status
      }
    });
  } catch (error) {
    next(error);
  }
};

const DEPOSIT_LIST_MAX_LIMIT = 100;

/**
 * GET /v1/monerium-b2b/deposits — the acting profile's EUR deposits, newest first,
 * each with its allocated conversion execution once the swap has run. This is the
 * polling surface for "payment received / converted".
 */
export const listMoneriumB2bDeposits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await findAccountForEffectiveUser(req);
    if (!account) {
      accountNotFound(res);
      return;
    }

    const rawLimit = Number(req.query.limit ?? 20);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, DEPOSIT_LIST_MAX_LIMIT) : 20;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const { count, rows } = await MoneriumFiatDeposit.findAndCountAll({
      limit,
      offset,
      order: [["created_at", "DESC"]],
      // Unattributed inflows (R09 synthetic rows) are an ops concern, never a
      // customer deposit claim — spec invariant, keep them out of the API.
      where: { accountId: account.id, moneriumOrderId: { [Op.notLike]: `${UNATTRIBUTED_ORDER_PREFIX}%` } }
    });

    const executionIds = [...new Set(rows.map(row => row.allocatedExecutionId).filter((id): id is string => id !== null))];
    const executions = executionIds.length ? await MoneriumConversionExecution.findAll({ where: { id: executionIds } }) : [];
    const executionById = new Map(executions.map(execution => [execution.id, execution]));

    res.status(httpStatus.OK).json({
      deposits: rows.map(row => {
        const execution = row.allocatedExecutionId ? executionById.get(row.allocatedExecutionId) : undefined;
        return {
          amountRaw: row.amountRaw,
          conversion: execution
            ? {
                executionId: execution.id,
                status: execution.status,
                txHash: execution.txHash,
                usdcNetRaw: execution.usdcNetRaw
              }
            : null,
          createdAt: row.createdAt,
          currency: row.currency,
          depositId: row.id,
          status: row.status,
          txHash: row.txHash
        };
      }),
      pagination: { limit, offset, total: count }
    });
  } catch (error) {
    next(error);
  }
};
