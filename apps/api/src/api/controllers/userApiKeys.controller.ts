import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import {
  ApiCredentialServiceError,
  createCredential,
  listCredentials,
  revokeCredential
} from "../services/apiCredential.service";

function requireProfile(req: Request, res: Response): string | null {
  if (req.userId) return req.userId;
  res.status(httpStatus.UNAUTHORIZED).json({
    error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required to manage API credentials", status: 401 }
  });
  return null;
}

function sendServiceError(res: Response, error: unknown): boolean {
  if (!(error instanceof ApiCredentialServiceError)) return false;
  const status =
    error.code === "CREDENTIAL_LIMIT_REACHED"
      ? httpStatus.CONFLICT
      : error.code === "CREDENTIAL_NOT_FOUND" || error.code === "CREDENTIAL_SUBJECT_REQUIRED"
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
  res.status(status).json({ error: { code: error.code, message: error.message, status } });
  return true;
}

export async function createUserApiKey(req: Request, res: Response): Promise<void> {
  const profileId = requireProfile(req, res);
  if (!profileId) return;
  try {
    const credential = await createCredential({
      environment: config.sandboxEnabled ? "test" : "live",
      expiresAt: req.body?.expiresAt,
      name: req.body?.name,
      partnerId: null,
      profileId
    });
    res.status(httpStatus.CREATED).json(credential);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    logger.error("Error creating API credential", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create API credential", status: 500 } });
  }
}

export async function listUserApiKeys(req: Request, res: Response): Promise<void> {
  const profileId = requireProfile(req, res);
  if (!profileId) return;
  try {
    res.status(httpStatus.OK).json({ credentials: await listCredentials({ profileId }) });
  } catch (error) {
    logger.error("Error listing API credentials", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list API credentials", status: 500 } });
  }
}

export async function revokeUserApiKey(req: Request<{ credentialId: string }>, res: Response): Promise<void> {
  const profileId = requireProfile(req, res);
  if (!profileId) return;
  try {
    await revokeCredential(req.params.credentialId, { profileId });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    if (sendServiceError(res, error)) return;
    logger.error("Error revoking API credential", error);
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to revoke API credential", status: 500 } });
  }
}
