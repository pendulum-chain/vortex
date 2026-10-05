import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { MANAGED_PROFILE_SUBJECT_TYPES, type ManagedProfileSubjectType } from "../../../models/partnerManagedProfile.model";
import { sendError } from "../../helpers/sendError";
import { createManagedProfile, ManagedProfileServiceError } from "../../services/managed-profile.service";

function isSubjectType(value: unknown): value is ManagedProfileSubjectType {
  return typeof value === "string" && (MANAGED_PROFILE_SUBJECT_TYPES as readonly string[]).includes(value);
}

export async function postManagedProfile(req: Request, res: Response): Promise<void> {
  const { email, externalUserId, partnerId, subjectType } = req.body ?? {};
  if (
    typeof email !== "string" ||
    typeof externalUserId !== "string" ||
    typeof partnerId !== "string" ||
    !isSubjectType(subjectType)
  ) {
    sendError(
      res,
      httpStatus.BAD_REQUEST,
      "MANAGED_PROFILE_INVALID_INPUT",
      `email, externalUserId, partnerId and subjectType (${MANAGED_PROFILE_SUBJECT_TYPES.join("|")}) are required`
    );
    return;
  }

  try {
    const managedProfile = await createManagedProfile({ email, externalUserId, partnerId, subjectType });
    res.status(managedProfile.created ? httpStatus.CREATED : httpStatus.OK).json({ managedProfile });
  } catch (error) {
    if (error instanceof ManagedProfileServiceError) {
      const status =
        error.code === "MANAGED_PROFILE_INVALID_INPUT"
          ? httpStatus.BAD_REQUEST
          : error.code === "MANAGED_PROFILE_PARTNER_NOT_FOUND"
            ? httpStatus.NOT_FOUND
            : error.code === "MANAGED_PROFILE_CONFLICT"
              ? httpStatus.CONFLICT
              : httpStatus.BAD_GATEWAY;
      sendError(res, status, error.code, error.message);
      return;
    }

    logger.error("Error creating managed profile", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to create managed profile");
  }
}
