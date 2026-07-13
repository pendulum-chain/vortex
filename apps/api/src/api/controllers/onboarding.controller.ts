import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import { APIError } from "../errors/api-error";
import { hydrateAveniaCompanyName } from "../services/avenia/avenia-customer.service";
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
    const entities = await CustomerEntity.findAll({ where: { profileId: userId } });
    const entityIds = entities.map(entity => entity.id);

    const providerCustomers = entityIds.length
      ? await ProviderCustomer.findAll({ order: [["updatedAt", "DESC"]], where: { customerEntityId: entityIds } })
      : [];
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

    const kycCases = entityIds.length ? await KycCase.findAll({ where: { customerEntityId: entityIds } }) : [];

    const kycCasesByProviderCustomer = new Map<string, KycCase>();
    for (const kycCase of kycCases) {
      if (kycCase.providerCustomerId) {
        kycCasesByProviderCustomer.set(kycCase.providerCustomerId, kycCase);
      }
    }

    res.status(httpStatus.OK).json({
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
      })
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
