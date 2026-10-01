import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import MoneriumAccount from "../../models/moneriumAccount.model";
import MoneriumFiatDeposit from "../../models/moneriumFiatDeposit.model";
import { APIError } from "../errors/api-error";
import { getAuthenticatedProfileId, getEffectiveUserId } from "../middlewares/effectiveUser";
import { processMoneriumWebhookInbox } from "../services/monerium-b2b/deposit-processor";
import { accountSnapshot, depositSnapshots, findRelationship } from "../services/monerium-b2b/manager-events";
import { UNATTRIBUTED_ORDER_PREFIX } from "../services/monerium-b2b/mint-watcher";
import {
  MONERIUM_ID_HEADER,
  MONERIUM_SIGNATURE_HEADER,
  MONERIUM_TIMESTAMP_HEADER,
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
    const webhookId = req.header(MONERIUM_ID_HEADER);
    const webhookTimestamp = req.header(MONERIUM_TIMESTAMP_HEADER);
    if (
      !rawBody ||
      !verifyWebhookSignature(rawBody, webhookId, webhookTimestamp, req.header(MONERIUM_SIGNATURE_HEADER), secret)
    ) {
      throw new APIError({ message: "Invalid webhook signature", status: httpStatus.UNAUTHORIZED });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new APIError({ message: "Webhook payload is not valid JSON", status: httpStatus.BAD_REQUEST });
    }

    await recordWebhookEvent(webhookId as string, payload);
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
    res.status(httpStatus.OK).json({ account: accountSnapshot(account, await findRelationship(account)) });
  } catch (error) {
    next(error);
  }
};

const DEPOSIT_LIST_MAX_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /v1/monerium-b2b/deposits — the acting profile's EUR deposits, newest first,
 * each with its chunk conversions and, once the whole deposit reached the destination,
 * the forward transaction. This is the polling surface for "payment received / converted".
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

    res.status(httpStatus.OK).json({
      deposits: await depositSnapshots(account, await findRelationship(account), rows),
      pagination: { limit, offset, total: count }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /v1/monerium-b2b/accounts — every onramp account of the calling manager's active
 * managed profiles, newest first, optionally narrowed to one Monerium profile. Manager
 * credential only: no delegation header, no child credential.
 */
export const listMoneriumB2bAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const managerProfileId = getAuthenticatedProfileId(req);
    const manager = managerProfileId ? await ManagedProfileManager.findByPk(managerProfileId) : null;
    if (
      !manager?.isActive ||
      !manager.allowedCorridors.includes("EU") ||
      (manager.allowedCustomerTypes !== null && !manager.allowedCustomerTypes.includes("business"))
    ) {
      res.status(httpStatus.FORBIDDEN).json({
        error: {
          code: "MANAGED_PROFILE_ACCESS_DENIED",
          message: "The authenticated profile does not manage business EUR onramp accounts",
          status: httpStatus.FORBIDDEN
        }
      });
      return;
    }
    const moneriumProfileId = req.query.moneriumProfileId;
    if (moneriumProfileId !== undefined && (typeof moneriumProfileId !== "string" || !UUID_PATTERN.test(moneriumProfileId))) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MONERIUM_B2B_INVALID_INPUT",
          message: "moneriumProfileId must be a UUID",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }
    const rawLimit = Number(req.query.limit ?? 20);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, DEPOSIT_LIST_MAX_LIMIT) : 20;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // ponytail: the manager's children go into one IN list; page the relationship query if a partner ever has thousands.
    const relationships = await ManagedProfile.findAll({ where: { managerProfileId: manager.profileId, status: "active" } });
    const byProfile = new Map(relationships.map(relationship => [relationship.profileId, relationship]));
    const { count, rows } = await MoneriumAccount.findAndCountAll({
      limit,
      offset,
      order: [["created_at", "DESC"]],
      where: {
        vortexProfileId: { [Op.in]: [...byProfile.keys()] },
        ...(moneriumProfileId ? { profileId: moneriumProfileId } : {})
      }
    });
    res.status(httpStatus.OK).json({
      accounts: rows.map(account => accountSnapshot(account, byProfile.get(account.vortexProfileId as string))),
      pagination: { limit, offset, total: count }
    });
  } catch (error) {
    next(error);
  }
};
