import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { ManagedProfileProvisioningError } from "../../services/managed-profile-provisioning.service";
import { MoneriumB2bProvisioningError, provisionMoneriumB2bAccount } from "../../services/monerium-b2b/account-provisioning";
import { markDepositForRecovery } from "../../services/monerium-b2b/conversion-executor";
import { isForwardTransition, withForwarderLock } from "../../services/monerium-b2b/deposit-processor";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function postMoneriumB2bAccount(req: Request, res: Response): Promise<void> {
  try {
    const {
      contactEmail,
      destination,
      externalSubjectId,
      floorPpm,
      forwarderAddress,
      managerProfileId,
      moneriumProfileId,
      targetPpm
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
      (targetPpm !== undefined && typeof targetPpm !== "number") ||
      (floorPpm !== undefined && typeof floorPpm !== "number")
    ) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MONERIUM_B2B_INVALID_INPUT",
          message:
            "managerProfileId (UUID), moneriumProfileId, externalSubjectId (1-255 characters), contactEmail, forwarderAddress, and destination are required; targetPpm and floorPpm must be numbers when present",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const result = await provisionMoneriumB2bAccount({
      contactEmail,
      destination,
      externalSubjectId,
      floorPpm,
      forwarderAddress,
      managerProfileId,
      moneriumProfileId,
      targetPpm
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
const STATUS_TRANSITIONS: Record<MoneriumAccountStatus, readonly MoneriumAccountStatus[]> = {
  [MoneriumAccountStatus.Onboarding]: [MoneriumAccountStatus.Active],
  [MoneriumAccountStatus.Active]: [MoneriumAccountStatus.Suspended, MoneriumAccountStatus.Closed],
  [MoneriumAccountStatus.Suspended]: [MoneriumAccountStatus.Active, MoneriumAccountStatus.Closed],
  [MoneriumAccountStatus.Closed]: []
};

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
    const targetStatus = status as MoneriumAccountStatus;
    if (targetStatus !== account.status && !STATUS_TRANSITIONS[account.status].includes(targetStatus)) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "MONERIUM_B2B_INVALID_STATUS_TRANSITION",
          message: `Monerium account cannot transition from ${account.status} to ${targetStatus}`,
          status: httpStatus.CONFLICT
        }
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

    if (targetStatus !== account.status) {
      await account.update({ status: targetStatus });
    }
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

/**
 * POST /v1/admin/monerium-b2b/deposits/:depositId/recover — marks a settling deposit for
 * the refund path (runbook §2.7). The keeper moves its unconverted EURe and converted
 * USDC to the recovery wallet once the clone's batch has been open for RECOVERY_DELAY;
 * the bank refund itself follows the runbook until it is automated.
 */
export async function postMoneriumB2bDepositRecovery(req: Request<{ depositId: string }>, res: Response): Promise<void> {
  try {
    if (!UUID_PATTERN.test(req.params.depositId)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: { code: "MONERIUM_B2B_INVALID_INPUT", message: "depositId must be a UUID", status: httpStatus.BAD_REQUEST }
      });
      return;
    }
    const refusal = await markDepositForRecovery(req.params.depositId);
    if (refusal === "deposit not found") {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: "MONERIUM_B2B_DEPOSIT_NOT_FOUND", message: "Monerium deposit not found", status: httpStatus.NOT_FOUND }
      });
      return;
    }
    if (refusal) {
      res.status(httpStatus.CONFLICT).json({
        error: { code: "MONERIUM_B2B_INVALID_STATUS_TRANSITION", message: refusal, status: httpStatus.CONFLICT }
      });
      return;
    }
    res
      .status(httpStatus.OK)
      .json({ deposit: { depositId: req.params.depositId, status: MoneriumFiatDepositStatus.Recovering } });
  } catch (error) {
    logger.error("Error marking Monerium B2B deposit for recovery:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to mark the deposit for recovery",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

const OPERATOR_DEPOSIT_STATUSES: readonly string[] = [
  MoneriumFiatDepositStatus.Refunded,
  MoneriumFiatDepositStatus.RecoveryFailed,
  MoneriumFiatDepositStatus.Recovering
];

/**
 * PATCH /v1/admin/monerium-b2b/deposits/:depositId/status — closes or retries a
 * recovery by hand: `refunded` once the bank refund went out, `recovery_failed` when it
 * cannot, `recovering` to retry a failed one. Forward-only like every deposit transition.
 */
export async function patchMoneriumB2bDepositStatus(req: Request<{ depositId: string }>, res: Response): Promise<void> {
  try {
    const { status } = req.body ?? {};
    if (!UUID_PATTERN.test(req.params.depositId) || typeof status !== "string" || !OPERATOR_DEPOSIT_STATUSES.includes(status)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "MONERIUM_B2B_INVALID_INPUT",
          message: `depositId must be a UUID and status must be one of ${OPERATOR_DEPOSIT_STATUSES.join(", ")}`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }
    const deposit = await MoneriumFiatDeposit.findByPk(req.params.depositId);
    if (!deposit) {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: "MONERIUM_B2B_DEPOSIT_NOT_FOUND", message: "Monerium deposit not found", status: httpStatus.NOT_FOUND }
      });
      return;
    }
    const account = await MoneriumAccount.findByPk(deposit.accountId);
    if (!account) {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: "MONERIUM_B2B_ACCOUNT_NOT_FOUND", message: "Monerium account not found", status: httpStatus.NOT_FOUND }
      });
      return;
    }
    const targetStatus = status as MoneriumFiatDepositStatus;
    const outcome = await withForwarderLock(account.forwarderAddress, async transaction => {
      const current = await MoneriumFiatDeposit.findByPk(deposit.id, { transaction });
      if (!current) return "missing";
      if (targetStatus === current.status) return "same";
      if (!isForwardTransition(current.status, targetStatus))
        return `Monerium deposit cannot transition from ${current.status} to ${targetStatus}`;
      await current.update({ status: targetStatus }, { transaction });
      return "updated";
    });
    if (outcome !== "updated" && outcome !== "same") {
      res.status(httpStatus.CONFLICT).json({
        error: { code: "MONERIUM_B2B_INVALID_STATUS_TRANSITION", message: outcome, status: httpStatus.CONFLICT }
      });
      return;
    }
    res.status(httpStatus.OK).json({ deposit: { depositId: deposit.id, status: targetStatus } });
  } catch (error) {
    logger.error("Error updating Monerium B2B deposit status:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update Monerium B2B deposit status",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
