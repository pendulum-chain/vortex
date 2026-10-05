import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { sendError } from "../../helpers/sendError";
import { UUID_PATTERN } from "../../helpers/uuid";
import { ManagedProfileProvisioningError } from "../../services/managed-profile-provisioning.service";
import { MoneriumB2bProvisioningError, provisionMoneriumB2bAccount } from "../../services/monerium-b2b/account-provisioning";
import { markDepositForRecovery } from "../../services/monerium-b2b/conversion-executor";
import { isForwardTransition, withForwarderLock } from "../../services/monerium-b2b/deposit-processor";
import { refundAccountFor } from "../../services/monerium-b2b/refund-wallet";

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
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "MONERIUM_B2B_INVALID_INPUT",
        "managerProfileId (UUID), moneriumProfileId, externalSubjectId (1-255 characters), contactEmail, forwarderAddress, and destination are required; targetPpm and floorPpm must be numbers when present"
      );
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
      sendError(res, status, error.code, error.message);
      return;
    }
    if (error instanceof ManagedProfileProvisioningError) {
      const status =
        error.code === "MANAGED_PROFILE_CONFLICT"
          ? httpStatus.CONFLICT
          : error.code === "MANAGED_PROFILE_MANAGER_NOT_FOUND"
            ? httpStatus.NOT_FOUND
            : httpStatus.BAD_REQUEST;
      sendError(res, status, error.code, error.message);
      return;
    }

    logger.error("Error provisioning Monerium B2B account:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to provision Monerium B2B account");
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
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "MONERIUM_B2B_INVALID_INPUT",
        `accountId must be a UUID and status must be one of ${STATUS_VALUES.join(", ")}`
      );
      return;
    }

    const account = await MoneriumAccount.findByPk(req.params.accountId);
    if (!account) {
      sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_ACCOUNT_NOT_FOUND", "Monerium account not found");
      return;
    }
    const targetStatus = status as MoneriumAccountStatus;
    if (targetStatus !== account.status && !STATUS_TRANSITIONS[account.status].includes(targetStatus)) {
      sendError(
        res,
        httpStatus.CONFLICT,
        "MONERIUM_B2B_INVALID_STATUS_TRANSITION",
        `Monerium account cannot transition from ${account.status} to ${targetStatus}`
      );
      return;
    }
    // Activation requires the issued IBAN: the client cannot pay in without it, and the
    // association monitor needs the reference state.
    if (status === MoneriumAccountStatus.Active && account.iban === null) {
      sendError(
        res,
        httpStatus.CONFLICT,
        "MONERIUM_B2B_ACCOUNT_NOT_READY",
        "The account has no issued IBAN yet and cannot be activated"
      );
      return;
    }

    if (targetStatus !== account.status) {
      await account.update({ status: targetStatus });
    }
    res.status(httpStatus.OK).json({ account: { accountId: account.id, accountStatus: account.status } });
  } catch (error) {
    logger.error("Error updating Monerium B2B account status:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to update Monerium B2B account status");
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
      sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "depositId must be a UUID");
      return;
    }
    // Partner-visible reason (DEPOSIT_UPDATED refund.reason); a missed window is marked by the deadline job.
    const reason = req.body?.reason ?? "operator";
    if (!["compliance", "incident", "operator"].includes(reason)) {
      sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "reason must be compliance, incident or operator");
      return;
    }
    const refusal = await markDepositForRecovery(req.params.depositId, reason);
    if (refusal === "deposit not found") {
      sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_DEPOSIT_NOT_FOUND", "Monerium deposit not found");
      return;
    }
    if (refusal) {
      sendError(res, httpStatus.CONFLICT, "MONERIUM_B2B_INVALID_STATUS_TRANSITION", refusal);
      return;
    }
    res
      .status(httpStatus.OK)
      .json({ deposit: { depositId: req.params.depositId, status: MoneriumFiatDepositStatus.Recovering } });
  } catch (error) {
    logger.error("Error marking Monerium B2B deposit for recovery:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to mark the deposit for recovery");
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
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "MONERIUM_B2B_INVALID_INPUT",
        `depositId must be a UUID and status must be one of ${OPERATOR_DEPOSIT_STATUSES.join(", ")}`
      );
      return;
    }
    const deposit = await MoneriumFiatDeposit.findByPk(req.params.depositId);
    if (!deposit) {
      sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_DEPOSIT_NOT_FOUND", "Monerium deposit not found");
      return;
    }
    const account = await MoneriumAccount.findByPk(deposit.accountId);
    if (!account) {
      sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_ACCOUNT_NOT_FOUND", "Monerium account not found");
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
      sendError(res, httpStatus.CONFLICT, "MONERIUM_B2B_INVALID_STATUS_TRANSITION", outcome);
      return;
    }
    res.status(httpStatus.OK).json({ deposit: { depositId: deposit.id, status: targetStatus } });
  } catch (error) {
    logger.error("Error updating Monerium B2B deposit status:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to update Monerium B2B deposit status");
  }
}

/**
 * GET /v1/admin/monerium-b2b/refund-address?moneriumProfileId= — the client's derived
 * refund wallet, to pass as `recoveryAddress` when deploying its forwarder (runbook §1.2).
 * Returns the address only; the key never leaves the backend.
 */
export async function getMoneriumB2bRefundAddress(req: Request, res: Response): Promise<void> {
  const moneriumProfileId = req.query.moneriumProfileId;
  if (typeof moneriumProfileId !== "string" || !UUID_PATTERN.test(moneriumProfileId)) {
    sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "moneriumProfileId must be a UUID");
    return;
  }
  try {
    const profileId = moneriumProfileId.toLowerCase();
    res.status(httpStatus.OK).json({ moneriumProfileId: profileId, refundAddress: refundAccountFor(profileId).address });
  } catch (error) {
    logger.error("Error deriving a Monerium B2B refund address:", error);
    sendError(res, httpStatus.SERVICE_UNAVAILABLE, "MONERIUM_B2B_NOT_CONFIGURED", "MONERIUM_B2B_REFUND_SEED is not configured");
  }
}
