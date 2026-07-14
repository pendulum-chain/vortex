import { BrlaApiService, KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { APIError } from "../errors/api-error";
import { hydrateAveniaCompanyName } from "../services/avenia/avenia-customer.service";
import { selectActiveCustomerEntity } from "../services/customer-entity.service";
import { getMoneriumStatus, MONERIUM_REAUTHENTICATION_REQUIRED } from "../services/monerium/monerium.service";

/**
 * GET /v1/onboarding/status — aggregated onboarding view for the authenticated profile
 * (plan D5), read directly from `provider_customers` + `kyc_cases`.
 */
export async function getOnboardingStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required", status: httpStatus.UNAUTHORIZED }
    });
    return;
  }

  try {
    const [profile, entities] = await Promise.all([
      User.findByPk(userId, { attributes: ["activeCustomerEntityId"] }),
      CustomerEntity.findAll({ where: { profileId: userId } })
    ]);
    const activeEntityId = entities.some(entity => entity.id === profile?.activeCustomerEntityId)
      ? (profile?.activeCustomerEntityId ?? null)
      : null;
    const entityIds = entities.map(entity => entity.id);

    const providerCustomers = entityIds.length
      ? await ProviderCustomer.findAll({ order: [["updatedAt", "DESC"]], where: { customerEntityId: entityIds } })
      : [];
    const kycCases = entityIds.length ? await KycCase.findAll({ where: { customerEntityId: entityIds } }) : [];
    const kycCasesByProviderCustomer = new Map<string, KycCase>();
    for (const kycCase of kycCases) {
      if (kycCase.providerCustomerId) {
        kycCasesByProviderCustomer.set(kycCase.providerCustomerId, kycCase);
      }
    }
    const providerErrors = new Map<string, { code: string; message: string }>();

    await Promise.all(
      providerCustomers
        .filter(customer => customer.provider === "monerium" && customer.status !== VerificationStatus.Rejected)
        .map(async customer => {
          try {
            const refreshed = await getMoneriumStatus(userId, customer.customerType);
            customer.set(
              "status",
              refreshed.status === "APPROVED"
                ? VerificationStatus.Approved
                : refreshed.status === "REJECTED"
                  ? VerificationStatus.Rejected
                  : ["authorization_started", "created", "incomplete"].includes(refreshed.statusExternal.toLowerCase())
                    ? VerificationStatus.Started
                    : VerificationStatus.InReview
            );
            customer.set("statusExternal", refreshed.statusExternal);
          } catch (error) {
            if (error instanceof APIError && error.type === MONERIUM_REAUTHENTICATION_REQUIRED) {
              providerErrors.set(customer.id, {
                code: MONERIUM_REAUTHENTICATION_REQUIRED,
                message: error.message
              });
            }
            // Status aggregation remains available if Monerium is unavailable or in-memory credentials were lost.
          }
        })
    );

    await Promise.all(
      providerCustomers
        .filter(
          customer =>
            customer.provider === "avenia" &&
            customer.customerType === "business" &&
            !customer.companyName?.trim() &&
            customer.providerSubaccountId
        )
        .map(async customer => hydrateAveniaCompanyName(customer))
    );

    await Promise.all(
      providerCustomers
        .filter(
          customer =>
            customer.provider === "avenia" &&
            customer.customerType === "business" &&
            customer.status !== VerificationStatus.Approved &&
            customer.status !== VerificationStatus.Rejected &&
            !!kycCasesByProviderCustomer.get(customer.id)?.providerCaseId
        )
        .map(async customer => {
          const kycCase = kycCasesByProviderCustomer.get(customer.id);
          if (!kycCase?.providerCaseId) return;
          try {
            const { attempt } = await BrlaApiService.getInstance().getKybAttemptStatus(kycCase.providerCaseId);
            const approved = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED;
            const rejected =
              attempt.status === KycAttemptStatus.EXPIRED ||
              (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED);
            const status = approved
              ? VerificationStatus.Approved
              : rejected
                ? VerificationStatus.Rejected
                : VerificationStatus.InReview;
            const lifecycle = {
              ...(approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
              ...(rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
            };
            await Promise.all([
              customer.update({ status, statusExternal: attempt.status }),
              kycCase.update({ status, statusExternal: attempt.status, ...lifecycle })
            ]);
          } catch {
            // Status aggregation remains available while Avenia is temporarily unavailable.
          }
        })
    );

    res.status(httpStatus.OK).json({
      activeEntityId,
      entities: entities.map(entity => {
        const accounts = providerCustomers.filter(customer => customer.customerEntityId === entity.id);
        return {
          accounts: accounts.map(customer => {
            const kycCase = kycCasesByProviderCustomer.get(customer.id) ?? null;
            return {
              companyName: customer.customerType === "business" ? customer.companyName : null,
              country: customer.country,
              customerType: customer.customerType,
              error: providerErrors.get(customer.id) ?? null,
              id: customer.id,
              kycCase: kycCase
                ? {
                    approvedAt: kycCase.approvedAt,
                    failureReasons: kycCase.failureReasons,
                    level: kycCase.level,
                    rejectedAt: kycCase.rejectedAt,
                    status: kycCase.status,
                    statusExternal: kycCase.statusExternal,
                    submittedAt: kycCase.submittedAt,
                    type: kycCase.type
                  }
                : null,
              provider: customer.provider,
              rail: customer.rail,
              state: customer.status,
              status: customer.status,
              statusExternal: customer.statusExternal
            };
          }),
          id: entity.id,
          status: entity.status,
          type: entity.type
        };
      }),
      selectionRequired: !activeEntityId
    });
  } catch (error) {
    logger.error("Error aggregating onboarding status:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to read onboarding status",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function putActiveEntity(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required", status: httpStatus.UNAUTHORIZED }
    });
    return;
  }

  const type = req.body?.type;
  if (type !== "individual" && type !== "business") {
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "INVALID_ACTIVE_ENTITY_TYPE",
        message: "type must be individual or business",
        status: httpStatus.BAD_REQUEST
      }
    });
    return;
  }

  try {
    const entity = await selectActiveCustomerEntity(req.userId, type);
    res.status(httpStatus.OK).json({ activeEntityId: entity.id, type: entity.type });
  } catch (error) {
    if (error instanceof APIError) {
      const status = error.status ?? httpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({
        error: { code: error.type ?? "ACTIVE_ENTITY_SELECTION_FAILED", message: error.message, status }
      });
      return;
    }
    logger.error("Error selecting active customer entity:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to select active customer entity",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
