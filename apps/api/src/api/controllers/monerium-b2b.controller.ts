import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import MoneriumAccount from "../../models/moneriumAccount.model";
import MoneriumAccountRegistration from "../../models/moneriumAccountRegistration.model";
import MoneriumFiatDeposit from "../../models/moneriumFiatDeposit.model";
import { APIError } from "../errors/api-error";
import { pageOf } from "../helpers/pagination";
import { sendError } from "../helpers/sendError";
import { UUID_PATTERN } from "../helpers/uuid";
import { getAuthenticatedProfileId, getEffectiveUserId } from "../middlewares/effectiveUser";
import { processMoneriumWebhookInbox } from "../services/monerium-b2b/deposit-processor";
import { accountSnapshot, depositSnapshots, findRelationship } from "../services/monerium-b2b/manager-events";
import { UNATTRIBUTED_ORDER_PREFIX } from "../services/monerium-b2b/mint-watcher";
import { MoneriumB2bRegistrationError, registerDestination, registrationSnapshot } from "../services/monerium-b2b/registration";
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
  sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_ACCOUNT_NOT_FOUND", "No Monerium account exists for the acting profile");
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

    const { limit, offset } = pageOf(req.query);

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

/** The authenticated manager when it may manage business EUR onramp accounts, else null. */
async function b2bManager(req: Request): Promise<ManagedProfileManager | null> {
  const managerProfileId = getAuthenticatedProfileId(req);
  const manager = managerProfileId ? await ManagedProfileManager.findByPk(managerProfileId) : null;
  return manager?.isActive &&
    manager.allowedCorridors.includes("EU") &&
    (manager.allowedCustomerTypes === null || manager.allowedCustomerTypes.includes("business"))
    ? manager
    : null;
}

function denyManager(res: Response): void {
  sendError(
    res,
    httpStatus.FORBIDDEN,
    "MANAGED_PROFILE_ACCESS_DENIED",
    "The authenticated profile does not manage business EUR onramp accounts"
  );
}

/**
 * GET /v1/monerium-b2b/accounts — every onramp account of the calling manager's active
 * managed profiles, newest first, optionally narrowed to one Monerium profile. Manager
 * credential only: no delegation header, no child credential.
 */
export const listMoneriumB2bAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const manager = await b2bManager(req);
    if (!manager) {
      denyManager(res);
      return;
    }
    const moneriumProfileId = req.query.moneriumProfileId;
    if (moneriumProfileId !== undefined && (typeof moneriumProfileId !== "string" || !UUID_PATTERN.test(moneriumProfileId))) {
      sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "moneriumProfileId must be a UUID");
      return;
    }
    const { limit, offset } = pageOf(req.query);

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

/**
 * GET /v1/monerium-b2b/registrations — the manager's destination registrations, newest
 * first: `requested` with what it waits for until the account exists, `mapped` with its
 * `accountId`, or `rejected` with the reason. Manager key only, like the accounts list.
 */
export const listMoneriumB2bRegistrations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const manager = await b2bManager(req);
    if (!manager) {
      denyManager(res);
      return;
    }
    const moneriumProfileId = req.query.moneriumProfileId;
    if (moneriumProfileId !== undefined && (typeof moneriumProfileId !== "string" || !UUID_PATTERN.test(moneriumProfileId))) {
      sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "moneriumProfileId must be a UUID");
      return;
    }
    const { limit, offset } = pageOf(req.query);
    const { count, rows } = await MoneriumAccountRegistration.findAndCountAll({
      limit,
      offset,
      order: [["created_at", "DESC"]],
      where: {
        managerProfileId: manager.profileId,
        ...(moneriumProfileId ? { moneriumProfileId: moneriumProfileId.toLowerCase() } : {})
      }
    });
    res.status(httpStatus.OK).json({
      pagination: { limit, offset, total: count },
      registrations: rows.map(registrationSnapshot)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /v1/monerium-b2b/accounts — the partner registers a client's destination by
 * Monerium profile ID (manager key only, never an impersonation token, and only the
 * manager bound to the white-label app). 202 for a new registration or a new attempt after
 * a rejection, 200 with the current state for an identical replay.
 */
export const registerMoneriumB2bAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const manager = await b2bManager(req);
    if (!manager || manager.profileId !== config.moneriumB2b.partnerManagerProfileId) {
      denyManager(res);
      return;
    }
    const { created, registration } = await registerDestination(manager.profileId, req.body ?? {});
    res.status(created ? httpStatus.ACCEPTED : httpStatus.OK).json({ registration });
  } catch (error) {
    if (error instanceof MoneriumB2bRegistrationError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    next(error);
  }
};
