import type { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { CUSTOMER_ENTITY_TYPES } from "../../models/customerEntity.model";
import type { ManagedProfileStatus } from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import { getAuthenticatedProfileId } from "../middlewares/effectiveUser";
import {
  ApiCredentialServiceError,
  createManagedProfileCredential,
  listManagedProfileCredentials,
  revokeManagedProfileCredential
} from "../services/apiCredential.service";
import {
  createManagedProfile,
  deleteManagedProfile,
  getManagedProfile,
  listManagedProfiles,
  ManagedProfileLifecycleError
} from "../services/managed-profile-lifecycle.service";
import { ManagedProfileProvisioningError } from "../services/managed-profile-provisioning.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function managerProfileId(req: Request): string {
  const profileId = getAuthenticatedProfileId(req);
  if (!profileId) throw new ManagedProfileLifecycleError("MANAGED_PROFILE_ACCESS_DENIED", "Authentication is required");
  return profileId;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ApiCredentialServiceError) {
    const status =
      error.code === "CREDENTIAL_ACCESS_DENIED"
        ? httpStatus.FORBIDDEN
        : error.code === "CREDENTIAL_NOT_FOUND" || error.code === "CREDENTIAL_SUBJECT_REQUIRED"
          ? httpStatus.NOT_FOUND
          : error.code === "CREDENTIAL_LIMIT_REACHED"
            ? httpStatus.CONFLICT
            : httpStatus.BAD_REQUEST;
    res.status(status).json({ error: { code: error.code, message: error.message, status } });
    return;
  }
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

function requireProfileId(profileId: string): void {
  if (!UUID_PATTERN.test(profileId)) {
    throw new ManagedProfileLifecycleError("MANAGED_PROFILE_INVALID_INPUT", "profileId must be a UUID");
  }
}

export async function postManagedProfile(req: Request, res: Response): Promise<void> {
  try {
    const { contactEmail, customerType, externalSubjectId } = req.body ?? {};
    if (
      typeof externalSubjectId !== "string" ||
      externalSubjectId.trim().length === 0 ||
      externalSubjectId.trim().length > 255 ||
      typeof contactEmail !== "string" ||
      !CUSTOMER_ENTITY_TYPES.includes(customerType)
    ) {
      throw new ManagedProfileLifecycleError(
        "MANAGED_PROFILE_INVALID_INPUT",
        "contactEmail, externalSubjectId (1-255 characters), and customerType (individual|business) are required"
      );
    }

    const result = await createManagedProfile({
      contactEmail,
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
    const manager = await ManagedProfileManager.findByPk(managerProfileId(req));
    if (!manager?.isActive) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_ACCESS_DENIED", "Managed profile access is denied");
    }
    res.status(httpStatus.OK).json({
      managedProfiles: result.managedProfiles,
      manager: {
        allowedCorridors: manager.allowedCorridors,
        allowedCustomerTypes: manager.allowedCustomerTypes,
        profileId: manager.profileId
      },
      pagination: { limit: result.limit, offset: result.offset, total: result.total }
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function readManagedProfile(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    requireProfileId(req.params.profileId);
    const managedProfile = await getManagedProfile(managerProfileId(req), req.params.profileId);
    res.status(httpStatus.OK).json({ managedProfile });
  } catch (error) {
    sendError(res, error);
  }
}

export async function removeManagedProfile(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    requireProfileId(req.params.profileId);
    await deleteManagedProfile(managerProfileId(req), req.params.profileId);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    sendError(res, error);
  }
}

export async function postManagedProfileApiCredential(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    requireProfileId(req.params.profileId);
    const credential = await createManagedProfileCredential({
      environment: config.sandboxEnabled ? "test" : "live",
      expiresAt: req.body?.expiresAt,
      managerProfileId: managerProfileId(req),
      name: req.body?.name,
      profileId: req.params.profileId
    });
    res.status(httpStatus.CREATED).json(credential);
  } catch (error) {
    sendError(res, error);
  }
}

export async function readManagedProfileApiCredentials(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    requireProfileId(req.params.profileId);
    const credentials = await listManagedProfileCredentials(managerProfileId(req), req.params.profileId);
    res.status(httpStatus.OK).json({ credentials });
  } catch (error) {
    sendError(res, error);
  }
}

export async function removeManagedProfileApiCredential(
  req: Request<{ credentialId: string; profileId: string }>,
  res: Response
): Promise<void> {
  try {
    requireProfileId(req.params.profileId);
    if (!UUID_PATTERN.test(req.params.credentialId)) {
      throw new ManagedProfileLifecycleError("MANAGED_PROFILE_INVALID_INPUT", "credentialId must be a UUID");
    }
    await revokeManagedProfileCredential(managerProfileId(req), req.params.profileId, req.params.credentialId);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    sendError(res, error);
  }
}
