import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import ManagedProfile from "../../../models/managedProfile.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumAccountRegistration, {
  MoneriumAccountRegistrationStatus
} from "../../../models/moneriumAccountRegistration.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { pageOf } from "../../helpers/pagination";
import { sendError } from "../../helpers/sendError";
import { UUID_PATTERN } from "../../helpers/uuid";
import { ManagedProfileProvisioningError } from "../../services/managed-profile-provisioning.service";
import { MoneriumB2bProvisioningError, provisionMoneriumB2bAccount } from "../../services/monerium-b2b/account-provisioning";
import { markDepositForRecovery } from "../../services/monerium-b2b/conversion-executor";
import { accountSnapshot } from "../../services/monerium-b2b/manager-events";
import { setDepositStatus } from "../../services/monerium-b2b/recovery";
import { refundAccountFor } from "../../services/monerium-b2b/refund-wallet";
import { registrationSnapshot, withdrawRegistration } from "../../services/monerium-b2b/registration";

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
  // Suspending an onboarding account records a failed destination check: nothing converts.
  [MoneriumAccountStatus.Onboarding]: [MoneriumAccountStatus.Active, MoneriumAccountStatus.Suspended],
  [MoneriumAccountStatus.Active]: [MoneriumAccountStatus.Suspended, MoneriumAccountStatus.Closed],
  [MoneriumAccountStatus.Suspended]: [MoneriumAccountStatus.Active, MoneriumAccountStatus.Closed],
  [MoneriumAccountStatus.Closed]: []
};

/**
 * GET /v1/admin/monerium-b2b/accounts — every onramp account, newest first, with the
 * partner manager it belongs to. `?status=onboarding` lists the accounts waiting for the
 * operator's activation (runbook §1.7); `?moneriumProfileId=` finds one client.
 */
export async function listMoneriumB2bAccountsForAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { moneriumProfileId, status } = req.query;
    if (
      (status !== undefined && (typeof status !== "string" || !STATUS_VALUES.includes(status))) ||
      (moneriumProfileId !== undefined && (typeof moneriumProfileId !== "string" || !UUID_PATTERN.test(moneriumProfileId)))
    ) {
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "MONERIUM_B2B_INVALID_INPUT",
        `status must be one of ${STATUS_VALUES.join(", ")} and moneriumProfileId a UUID`
      );
      return;
    }
    const { limit, offset } = pageOf(req.query);
    const { count, rows } = await MoneriumAccount.findAndCountAll({
      limit,
      offset,
      order: [["created_at", "DESC"]],
      where: {
        ...(status ? { status: status as MoneriumAccountStatus } : {}),
        ...(moneriumProfileId ? { profileId: (moneriumProfileId as string).toLowerCase() } : {})
      }
    });
    const childIds = rows.map(account => account.vortexProfileId).filter((id): id is string => id !== null);
    const relationships = await ManagedProfile.findAll({ where: { profileId: childIds } });
    const byProfile = new Map(relationships.map(relationship => [relationship.profileId, relationship]));
    res.status(httpStatus.OK).json({
      accounts: rows.map(account => {
        const relationship = account.vortexProfileId ? byProfile.get(account.vortexProfileId) : undefined;
        return { ...accountSnapshot(account, relationship), managerProfileId: relationship?.managerProfileId ?? null };
      }),
      pagination: { limit, offset, total: count }
    });
  } catch (error) {
    logger.error("Error listing Monerium B2B accounts:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list Monerium B2B accounts");
  }
}

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
      const from = account.status;
      await account.update({
        status: targetStatus,
        ...(targetStatus === MoneriumAccountStatus.Active ? { activatedAt: new Date() } : {})
      });
      logger.info(
        `monerium-b2b: operator moved account ${account.id} from ${from} to ${targetStatus} ` +
          `(destination ${account.destination}, forwarder ${account.forwarderAddress})`
      );
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
    const targetStatus = status as MoneriumFiatDepositStatus;
    const refusal = await setDepositStatus(deposit, targetStatus);
    if (refusal) {
      sendError(res, httpStatus.CONFLICT, "MONERIUM_B2B_INVALID_STATUS_TRANSITION", refusal);
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

const REGISTRATION_STATUS_VALUES = Object.values(MoneriumAccountRegistrationStatus) as string[];

/**
 * GET /v1/admin/monerium-b2b/registrations — every partner registration, newest first, with
 * the keeper's progress (deployment, last check); `?status=requested` lists those in flight.
 */
export async function listMoneriumB2bRegistrationsForAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.query;
    if (status !== undefined && (typeof status !== "string" || !REGISTRATION_STATUS_VALUES.includes(status))) {
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "MONERIUM_B2B_INVALID_INPUT",
        `status must be one of ${REGISTRATION_STATUS_VALUES.join(", ")}`
      );
      return;
    }
    const { limit, offset } = pageOf(req.query);
    const { count, rows } = await MoneriumAccountRegistration.findAndCountAll({
      limit,
      offset,
      order: [["created_at", "DESC"]],
      where: status ? { status: status as MoneriumAccountRegistrationStatus } : {}
    });
    res.status(httpStatus.OK).json({
      pagination: { limit, offset, total: count },
      registrations: rows.map(registration => ({
        ...registrationSnapshot(registration),
        contactEmail: registration.contactEmail,
        deploySentAt: registration.deploySentAt?.toISOString() ?? null,
        deployTxHash: registration.deployTxHash,
        id: registration.id,
        lastCheckedAt: registration.lastCheckedAt?.toISOString() ?? null,
        managerProfileId: registration.managerProfileId
      }))
    });
  } catch (error) {
    logger.error("Error listing Monerium B2B registrations:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list Monerium B2B registrations");
  }
}

/** POST /v1/admin/monerium-b2b/registrations/:registrationId/withdraw — see withdrawRegistration. */
export async function postMoneriumB2bRegistrationWithdrawal(
  req: Request<{ registrationId: string }>,
  res: Response
): Promise<void> {
  try {
    if (!UUID_PATTERN.test(req.params.registrationId)) {
      sendError(res, httpStatus.BAD_REQUEST, "MONERIUM_B2B_INVALID_INPUT", "registrationId must be a UUID");
      return;
    }
    if (!(await withdrawRegistration(req.params.registrationId))) {
      const exists = await MoneriumAccountRegistration.findByPk(req.params.registrationId);
      if (!exists) {
        sendError(res, httpStatus.NOT_FOUND, "MONERIUM_B2B_REGISTRATION_NOT_FOUND", "Monerium registration not found");
        return;
      }
      sendError(
        res,
        httpStatus.CONFLICT,
        "MONERIUM_B2B_REGISTRATION_NOT_WITHDRAWABLE",
        "Only a requested registration can be withdrawn"
      );
      return;
    }
    const registration = await MoneriumAccountRegistration.findByPk(req.params.registrationId);
    res.status(httpStatus.OK).json({ registration: registrationSnapshot(registration as MoneriumAccountRegistration) });
  } catch (error) {
    logger.error("Error withdrawing Monerium B2B registration:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to withdraw Monerium B2B registration");
  }
}
