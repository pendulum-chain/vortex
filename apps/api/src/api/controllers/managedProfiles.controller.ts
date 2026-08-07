import type { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import type { CustomerEntityType } from "../../models/customerEntity.model";
import type { ManagedProfileStatus } from "../../models/managedProfile.model";
import { getAuthenticatedProfileId } from "../middlewares/effectiveUser";
import {
  createManagedProfile,
  deleteManagedProfile,
  getManagedProfile,
  listManagedProfiles,
  ManagedProfileLifecycleError
} from "../services/managed-profile-lifecycle.service";
import { ManagedProfileProvisioningError } from "../services/managed-profile-provisioning.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_TYPES: CustomerEntityType[] = ["individual", "business"];

function managerProfileId(req: Request): string {
  const profileId = getAuthenticatedProfileId(req);
  if (!profileId) throw new ManagedProfileLifecycleError("MANAGED_PROFILE_ACCESS_DENIED", "Authentication is required");
  return profileId;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ManagedProfileLifecycleError || error instanceof ManagedProfileProvisioningError) {
    const status =
      error.code === "MANAGED_PROFILE_INVALID_INPUT"
        ? httpStatus.BAD_REQUEST
        : error.code === "MANAGED_PROFILE_NOT_FOUND"
          ? httpStatus.NOT_FOUND
          : error.code === "MANAGED_PROFILE_CONFLICT"
            ? httpStatus.CONFLICT
            : httpStatus.FORBIDDEN;
    res.status(status).json({ error: { code: error.code, message: error.message, status } });
    return;
  }
  logger.error("Error handling managed profile lifecycle request", error);
  res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process managed profile lifecycle request",
      status: httpStatus.INTERNAL_SERVER_ERROR
    }
  });
}

export async function postManagedProfile(req: Request, res: Response): Promise<void> {
  try {
    const { customerType, externalSubjectId } = req.body ?? {};
    if (
      typeof externalSubjectId !== "string" ||
      externalSubjectId.trim().length === 0 ||
      externalSubjectId.trim().length > 255 ||
      !CUSTOMER_TYPES.includes(customerType)
    ) {
      throw new ManagedProfileLifecycleError(
        "MANAGED_PROFILE_INVALID_INPUT",
        "externalSubjectId (1-255 characters) and customerType (individual|business) are required"
      );
    }

    const result = await createManagedProfile({
      creationSource: "manager",
      customerType,
      externalSubjectId,
      managerProfileId: managerProfileId(req)
    });
    res.status(result.created ? httpStatus.CREATED : httpStatus.OK).json({ managedProfile: result.managedProfile });
  } catch (error) {
    sendError(res, error);
  }
}

export async function readManagedProfiles(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    const status = req.query.status === undefined ? "active" : req.query.status;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      !["active", "deleted", "all"].includes(status as string)
    ) {
      throw new ManagedProfileLifecycleError(
        "MANAGED_PROFILE_INVALID_INPUT",
        "limit must be 1-100, offset must be non-negative, and status must be active, deleted, or all"
      );
    }

    const result = await listManagedProfiles(managerProfileId(req), {
      limit,
      offset,
      status: status as ManagedProfileStatus | "all"
    });
    res.status(httpStatus.OK).json({
      managedProfiles: result.managedProfiles,
      pagination: { limit: result.limit, offset: result.offset, total: result.total }
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function readManagedProfile(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    if (!UUID_PATTERN.test(req.params.profileId)) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_INVALID_INPUT", "profileId must be a UUID");
    }
    const managedProfile = await getManagedProfile(managerProfileId(req), req.params.profileId);
    res.status(httpStatus.OK).json({ managedProfile });
  } catch (error) {
    sendError(res, error);
  }
}

export async function removeManagedProfile(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    if (!UUID_PATTERN.test(req.params.profileId)) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_INVALID_INPUT", "profileId must be a UUID");
    }
    await deleteManagedProfile(managerProfileId(req), req.params.profileId);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    sendError(res, error);
  }
}
