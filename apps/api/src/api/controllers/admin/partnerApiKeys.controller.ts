import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import Partner from "../../../models/partner.model";
import User from "../../../models/user.model";
import {
  ApiCredentialServiceError,
  createCredential,
  listCredentials,
  revokeCredential
} from "../../services/apiCredential.service";

async function resolveSubject(req: Request<{ partnerName: string }>, res: Response) {
  const partner = await Partner.findOne({ where: { name: req.params.partnerName } });
  if (!partner) {
    res.status(404).json({ error: { code: "PARTNER_NOT_FOUND", message: "Partner was not found", status: 404 } });
    return null;
  }
  const userId = req.body?.userId ?? req.query.userId;
  if (typeof userId !== "string" || !userId) {
    res.status(400).json({
      error: { code: "CREDENTIAL_SUBJECT_REQUIRED", message: "userId profile subject is required", status: 400 }
    });
    return null;
  }
  if (!(await User.findByPk(userId, { attributes: ["id"] }))) {
    res.status(404).json({ error: { code: "CREDENTIAL_SUBJECT_REQUIRED", message: "Profile was not found", status: 404 } });
    return null;
  }
  return { partner, profileId: userId };
}

function sendError(res: Response, error: unknown): boolean {
  if (!(error instanceof ApiCredentialServiceError)) return false;
  const status = error.code === "CREDENTIAL_LIMIT_REACHED" ? 409 : error.code === "CREDENTIAL_NOT_FOUND" ? 404 : 400;
  res.status(status).json({ error: { code: error.code, message: error.message, status } });
  return true;
}

export async function createApiKey(req: Request<{ partnerName: string }>, res: Response): Promise<void> {
  try {
    const subject = await resolveSubject(req, res);
    if (!subject) return;
    const credential = await createCredential({
      environment: config.sandboxEnabled ? "test" : "live",
      expiresAt: req.body?.expiresAt,
      name: req.body?.name,
      partnerId: subject.partner.id,
      profileId: subject.profileId
    });
    res.status(httpStatus.CREATED).json(credential);
  } catch (error) {
    if (sendError(res, error)) return;
    logger.error("Error creating partner API credential", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create API credential", status: 500 } });
  }
}

export async function listApiKeys(req: Request<{ partnerName: string }>, res: Response): Promise<void> {
  try {
    const subject = await resolveSubject(req, res);
    if (!subject) return;
    res.status(200).json({
      credentials: await listCredentials({ partnerId: subject.partner.id, profileId: subject.profileId }),
      partnerId: subject.partner.id,
      partnerName: subject.partner.name,
      profileId: subject.profileId
    });
  } catch (error) {
    logger.error("Error listing partner API credentials", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list API credentials", status: 500 } });
  }
}

export async function revokeApiKey(req: Request<{ credentialId: string; partnerName: string }>, res: Response): Promise<void> {
  try {
    const subject = await resolveSubject(req, res);
    if (!subject) return;
    await revokeCredential(req.params.credentialId, { partnerId: subject.partner.id, profileId: subject.profileId });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    if (sendError(res, error)) return;
    logger.error("Error revoking partner API credential", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to revoke API credential", status: 500 } });
  }
}
