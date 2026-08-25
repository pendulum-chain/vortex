import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { MANAGED_PROFILE_SUBJECT_TYPES, type ManagedProfileSubjectType } from "../../../models/partnerManagedProfile.model";
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
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "MANAGED_PROFILE_INVALID_INPUT",
        message: `email, externalUserId, partnerId and subjectType (${MANAGED_PROFILE_SUBJECT_TYPES.join("|")}) are required`,
        status: httpStatus.BAD_REQUEST
      }
    });
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
      res.status(status).json({ error: { code: error.code, message: error.message, status } });
      return;
    }

    logger.error("Error creating managed profile", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create managed profile",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
