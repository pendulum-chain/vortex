import { CORRIDOR_CAPABILITIES, type CorridorCountry } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import type { CustomerEntityType } from "../../../models/customerEntity.model";
import { createManagedProfile } from "../../services/managed-profile-lifecycle.service";
import {
  configureManagedProfileManager,
  getManagedProfileManager,
  ManagedProfileManagerError
} from "../../services/managed-profile-manager.service";
import { ManagedProfileProvisioningError } from "../../services/managed-profile-provisioning.service";

const SUPPORTED_CORRIDORS = Object.keys(CORRIDOR_CAPABILITIES) as CorridorCountry[];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_TYPES: CustomerEntityType[] = ["individual", "business"];

function isCorridorCountry(value: unknown): value is CorridorCountry {
  return typeof value === "string" && SUPPORTED_CORRIDORS.includes(value as CorridorCountry);
}

export async function putManagedProfileManager(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    const { allowedCorridors, isActive } = req.body ?? {};
    if (
      !UUID_PATTERN.test(req.params.profileId) ||
      !Array.isArray(allowedCorridors) ||
      allowedCorridors.length === 0 ||
      !allowedCorridors.every(isCorridorCountry) ||
      new Set(allowedCorridors).size !== allowedCorridors.length ||
      typeof isActive !== "boolean"
    ) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_MANAGED_PROFILE_MANAGER_INPUT",
          message: `profileId must be a UUID, isActive must be a boolean, and allowedCorridors must be a non-empty, duplicate-free array containing: ${SUPPORTED_CORRIDORS.join(", ")}`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const configured = await configureManagedProfileManager({
      allowedCorridors,
      isActive,
      profileId: req.params.profileId
    });
    res.status(configured.created ? httpStatus.CREATED : httpStatus.OK).json({ manager: configured.manager });
  } catch (error) {
    if (error instanceof ManagedProfileManagerError) {
      const status = error.code === "PROFILE_NOT_FOUND" ? httpStatus.NOT_FOUND : httpStatus.CONFLICT;
      res.status(status).json({ error: { code: error.code, message: error.message, status } });
      return;
    }

    logger.error("Error configuring managed profile manager:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to configure managed profile manager",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function readManagedProfileManager(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    if (!UUID_PATTERN.test(req.params.profileId)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_MANAGED_PROFILE_MANAGER_INPUT",
          message: "profileId must be a UUID",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }
    res.status(httpStatus.OK).json({ manager: await getManagedProfileManager(req.params.profileId) });
  } catch (error) {
    if (error instanceof ManagedProfileManagerError) {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: error.code, message: error.message, status: httpStatus.NOT_FOUND }
      });
      return;
    }

    logger.error("Error reading managed profile manager:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to read managed profile manager",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function postManagedProfileForManager(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    const { customerType, externalSubjectId } = req.body ?? {};
    if (
      !UUID_PATTERN.test(req.params.profileId) ||
      typeof externalSubjectId !== "string" ||
      externalSubjectId.trim().length === 0 ||
      externalSubjectId.trim().length > 255 ||
      !CUSTOMER_TYPES.includes(customerType)
    ) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MANAGED_PROFILE_INVALID_INPUT",
          message:
            "profileId must be a UUID, and externalSubjectId (1-255 characters) and customerType (individual|business) are required",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const result = await createManagedProfile({
      creationSource: "vortex",
      customerType,
      externalSubjectId,
      managerProfileId: req.params.profileId
    });
    res.status(result.created ? httpStatus.CREATED : httpStatus.OK).json({ managedProfile: result.managedProfile });
  } catch (error) {
    if (error instanceof ManagedProfileProvisioningError) {
      const status =
        error.code === "MANAGED_PROFILE_CONFLICT"
          ? httpStatus.CONFLICT
          : error.code === "MANAGED_PROFILE_INVALID_INPUT"
            ? httpStatus.BAD_REQUEST
            : error.code === "MANAGED_PROFILE_MANAGER_NOT_FOUND"
              ? httpStatus.NOT_FOUND
              : httpStatus.CONFLICT;
      res.status(status).json({ error: { code: error.code, message: error.message, status } });
      return;
    }

    logger.error("Error provisioning headless managed profile:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to provision managed profile",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
