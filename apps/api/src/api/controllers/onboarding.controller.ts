import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer from "../../models/providerCustomer.model";
import { isProviderApproved, isProviderRestricted } from "../services/recipients/transfer-eligibility.service";

function providerState(status: string): "approved" | "rejected" | "pending" {
  if (isProviderApproved(status)) {
    return "approved";
  }
  if (isProviderRestricted(status)) {
    return "rejected";
  }
  return "pending";
}

/**
 * GET /v1/onboarding/status — aggregated onboarding view for the authenticated profile
 * (plan D5), read directly from `provider_customers` + `kyc_cases`. Statuses are the
 * provider-verbatim values; `state` is the normalized approved/pending/rejected rollup.
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

    const [providerCustomers, kycCases] = await Promise.all([
      entityIds.length
        ? ProviderCustomer.findAll({ order: [["updatedAt", "DESC"]], where: { customerEntityId: entityIds } })
        : [],
      entityIds.length ? KycCase.findAll({ where: { customerEntityId: entityIds } }) : []
    ]);

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
              country: customer.country,
              customerType: customer.customerType,
              id: customer.id,
              kycCase: kycCase
                ? {
                    approvedAt: kycCase.approvedAt,
                    failureReasons: kycCase.failureReasons,
                    level: kycCase.level,
                    rejectedAt: kycCase.rejectedAt,
                    status: kycCase.status,
                    submittedAt: kycCase.submittedAt,
                    type: kycCase.type
                  }
                : null,
              provider: customer.provider,
              rail: customer.rail,
              state: providerState(customer.status),
              status: customer.status
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
