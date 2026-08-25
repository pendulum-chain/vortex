import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { getRampInfo as resolveRampInfo } from "../services/rampInfo.service";

export async function getRampInfo(req: Request, res: Response): Promise<void> {
  const profileId = getEffectiveUserId(req);
  if (!req.credential || !profileId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: {
        code: "CREDENTIAL_REQUIRED",
        message: "A public or secret API credential is required",
        status: httpStatus.UNAUTHORIZED
      }
    });
    return;
  }

  try {
    res.status(httpStatus.OK).json(await resolveRampInfo(profileId));
  } catch (error) {
    logger.error("Failed to resolve ramp info", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to read ramp info",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
