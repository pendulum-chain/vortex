import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer from "../../models/providerCustomer.model";
import { getMoneriumStatus } from "../services/monerium/monerium.service";
import {
  isProviderApproved,
  isProviderInReview,
  isProviderRestricted
} from "../services/recipients/transfer-eligibility.service";

function providerState(
  status: string,
  provider: string,
  statusExternal: string | null
): "approved" | "rejected" | "in_review" | "pending" {
  if (isProviderApproved(status)) {
    return "approved";
  }
  if (isProviderRestricted(status)) {
    return "rejected";
  }
  if (
    provider === "monerium" &&
    ["authorization_started", "created", "incomplete"].includes(statusExternal?.toLowerCase() ?? "")
  ) {
    return "pending";
  }
  if (isProviderInReview(status)) {
    return "in_review";
  }
  return "pending";
}

/**
 * GET /v1/onboarding/status — aggregated onboarding view for the authenticated profile
 * (plan D5), read directly from `provider_customers` + `kyc_cases`. Statuses are the
 * provider-verbatim values; `state` is the normalized approved/in_review/pending/rejected rollup.
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

    await Promise.all(
      providerCustomers
        .filter(customer => customer.provider === "monerium" && customer.status !== "REJECTED")
        .map(async customer => {
          try {
            const refreshed = await getMoneriumStatus(userId, customer.customerType);
            customer.set("status", refreshed.status);
            customer.set("statusExternal", refreshed.statusExternal);
          } catch {
            // Status aggregation remains available if Monerium is unavailable or in-memory credentials were lost.
          }
        })
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
              state: providerState(customer.status, customer.provider, customer.statusExternal),
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
