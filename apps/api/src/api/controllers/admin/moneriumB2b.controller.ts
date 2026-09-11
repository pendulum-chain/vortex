import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
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

const STATUS_VALUES = Object.values(MoneriumAccountStatus) as string[];

export async function patchMoneriumB2bAccountStatus(req: Request<{ accountId: string }>, res: Response): Promise<void> {
  try {
    const { status } = req.body ?? {};
    if (!UUID_PATTERN.test(req.params.accountId) || typeof status !== "string" || !STATUS_VALUES.includes(status)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MONERIUM_B2B_INVALID_INPUT",
          message: `accountId must be a UUID and status must be one of ${STATUS_VALUES.join(", ")}`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const account = await MoneriumAccount.findByPk(req.params.accountId);
    if (!account) {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: "MONERIUM_B2B_ACCOUNT_NOT_FOUND", message: "Monerium account not found", status: httpStatus.NOT_FOUND }
      });
      return;
    }
    // Activation requires the issued IBAN: the penny test (runbook §7) cannot have
    // happened without it, and the association monitor needs the reference state.
    if (status === MoneriumAccountStatus.Active && account.iban === null) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "MONERIUM_B2B_ACCOUNT_NOT_READY",
          message: "The account has no issued IBAN yet and cannot be activated",
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    await account.update({ status: status as MoneriumAccountStatus });
    res.status(httpStatus.OK).json({ account: { accountId: account.id, accountStatus: account.status } });
  } catch (error) {
    logger.error("Error updating Monerium B2B account status:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update Monerium B2B account status",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
