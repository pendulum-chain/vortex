import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { sendError } from "../helpers/sendError";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { getRampInfo as resolveRampInfo } from "../services/rampInfo.service";

export async function getRampInfo(req: Request, res: Response): Promise<void> {
  const profileId = getEffectiveUserId(req);
  if (!req.credential || !profileId) {
    sendError(res, httpStatus.UNAUTHORIZED, "CREDENTIAL_REQUIRED", "A public or secret API credential is required");
    return;
  }

  try {
    res.status(httpStatus.OK).json(await resolveRampInfo(profileId));
  } catch (error) {
    logger.error("Failed to resolve ramp info", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to read ramp info");
  }
}
