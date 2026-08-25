import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { ManagedProfileProvisioningError } from "../../services/managed-profile-provisioning.service";
import { MoneriumB2bProvisioningError, provisionMoneriumB2bAccount } from "../../services/monerium-b2b/account-provisioning";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function postMoneriumB2bAccount(req: Request, res: Response): Promise<void> {
  try {
    const {
      contactEmail,
      destination,
      externalSubjectId,
      fallbackAddress,
      feeBps,
      forwarderAddress,
      managerProfileId,
      moneriumProfileId
    } = req.body ?? {};
    if (
      typeof managerProfileId !== "string" ||
      !UUID_PATTERN.test(managerProfileId) ||
      typeof moneriumProfileId !== "string" ||
      typeof externalSubjectId !== "string" ||
      externalSubjectId.trim().length === 0 ||
      externalSubjectId.trim().length > 255 ||
      typeof contactEmail !== "string" ||
      typeof forwarderAddress !== "string" ||
      typeof destination !== "string" ||
      typeof fallbackAddress !== "string" ||
      (feeBps !== undefined && typeof feeBps !== "number")
    ) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MONERIUM_B2B_INVALID_INPUT",
          message:
            "managerProfileId (UUID), moneriumProfileId, externalSubjectId (1-255 characters), contactEmail, forwarderAddress, destination, and fallbackAddress are required; feeBps must be a number when present",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const result = await provisionMoneriumB2bAccount({
      contactEmail,
      destination,
      externalSubjectId,
      fallbackAddress,
      feeBps,
      forwarderAddress,
      managerProfileId,
      moneriumProfileId
    });
    res.status(result.created ? httpStatus.CREATED : httpStatus.OK).json({ account: result });
  } catch (error) {
    if (error instanceof MoneriumB2bProvisioningError) {
      const status = error.code === "MONERIUM_B2B_INVALID_INPUT" ? httpStatus.BAD_REQUEST : httpStatus.CONFLICT;
      res.status(status).json({ error: { code: error.code, message: error.message, status } });
      return;
    }
    if (error instanceof ManagedProfileProvisioningError) {
      const status =
        error.code === "MANAGED_PROFILE_CONFLICT"
          ? httpStatus.CONFLICT
          : error.code === "MANAGED_PROFILE_MANAGER_NOT_FOUND"
            ? httpStatus.NOT_FOUND
            : httpStatus.BAD_REQUEST;
      res.status(status).json({ error: { code: error.code, message: error.message, status } });
      return;
    }

    logger.error("Error provisioning Monerium B2B account:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to provision Monerium B2B account",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
