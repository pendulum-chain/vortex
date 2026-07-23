import { BrlaApiService, KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProfileRole from "../../models/profileRole.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { APIError } from "../errors/api-error";
import { refreshAlfredpayCustomerStatus } from "../services/alfredpay/alfredpay-customer.service";
import { hydrateAveniaCompanyName } from "../services/avenia/avenia-customer.service";
import { selectActiveCustomerEntity } from "../services/customer-entity.service";
import { getMoneriumStatus, MONERIUM_REAUTHENTICATION_REQUIRED } from "../services/monerium/monerium.service";

// Provider status refreshes piggyback on the dashboard's 15s status poll; cap them per customer so
// polling (and multiple open tabs) doesn't hammer the providers. Marking at check time also dedupes
// concurrent polls. In-memory on purpose: per instance, the cap just multiplies by instance count.
const PROVIDER_REFRESH_TTL_MS = 60_000;
const lastProviderRefreshAt = new Map<string, number>();

function shouldRefreshProviderStatus(customerId: string): boolean {
  const now = Date.now();
  const last = lastProviderRefreshAt.get(customerId);
  if (last !== undefined && now - last < PROVIDER_REFRESH_TTL_MS) {
    return false;
  }
  if (lastProviderRefreshAt.size > 10_000) {
    for (const [id, at] of lastProviderRefreshAt) {
      if (now - at >= PROVIDER_REFRESH_TTL_MS) lastProviderRefreshAt.delete(id);
    }
  }
  lastProviderRefreshAt.set(customerId, now);
  return true;
}

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
    const [profile, entities, profileRoles] = await Promise.all([
      User.findByPk(userId, { attributes: ["activeCustomerEntityId"] }),
      CustomerEntity.findAll({ where: { profileId: userId } }),
      ProfileRole.findAll({ attributes: ["role"], where: { userId } })
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
            !!kycCasesByProviderCustomer.get(customer.id)?.providerCaseId &&
            shouldRefreshProviderStatus(customer.id)
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
            // A PENDING attempt is one the user never finished (hosted steps not completed) — keep it
            // pending so the dashboard offers Continue; in_review only once Avenia is PROCESSING.
            const status = approved
              ? VerificationStatus.Approved
              : rejected
                ? VerificationStatus.Rejected
                : attempt.status === KycAttemptStatus.PENDING
                  ? VerificationStatus.Pending
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

    // Avenia individual KYC: refresh from the latest attempt so an approval/rejection that lands
    // after the wizard closed is reflected here — nothing else polls Avenia for individuals.
    await Promise.all(
      providerCustomers
        .filter(
          customer =>
            customer.provider === "avenia" &&
            customer.customerType === "individual" &&
            customer.status !== VerificationStatus.Approved &&
            customer.status !== VerificationStatus.Rejected &&
            !!customer.providerSubaccountId &&
            shouldRefreshProviderStatus(customer.id)
        )
        .map(async customer => {
          const kycCase = kycCasesByProviderCustomer.get(customer.id);
          try {
            const { attempts } = await BrlaApiService.getInstance().getKycAttempts(customer.providerSubaccountId as string);
            const attempt = attempts[0];
            if (!attempt) return;
            const approved = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED;
            const rejected = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED;
            // A PENDING or EXPIRED attempt is one the user never finished (livecheck not completed) —
            // not a rejection: keep it pending so the dashboard offers Continue, mirroring
            // fetchSubaccountKycStatus. Only an Avenia decision is terminal.
            const status = approved
              ? VerificationStatus.Approved
              : rejected
                ? VerificationStatus.Rejected
                : attempt.status === KycAttemptStatus.PENDING || attempt.status === KycAttemptStatus.EXPIRED
                  ? VerificationStatus.Pending
                  : VerificationStatus.InReview;
            const lifecycle = {
              ...(approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
              ...(rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
            };
            await Promise.all([
              customer.update({ status, statusExternal: attempt.status }),
              kycCase?.update({ status, statusExternal: attempt.status, ...lifecycle })
            ]);
          } catch {
            // Status aggregation remains available while Avenia is temporarily unavailable.
          }
        })
    );

    // Alfredpay: refresh non-terminal accounts against the provider so an outcome that lands after
    // the KYC wizard closed is reflected here — the machine only polls Alfredpay while it is open.
    await Promise.all(
      providerCustomers
        .filter(
          customer =>
            customer.provider === "alfredpay" &&
            customer.status !== VerificationStatus.Approved &&
            customer.status !== VerificationStatus.Rejected &&
            shouldRefreshProviderStatus(customer.id)
        )
        .map(customer => refreshAlfredpayCustomerStatus(customer))
    );

    // Alfredpay status refresh may update or create a case through a separate model instance.
    // Re-read cases so the nested response agrees with the freshly updated account state.
    const refreshedKycCases = entityIds.length ? await KycCase.findAll({ where: { customerEntityId: entityIds } }) : [];
    kycCasesByProviderCustomer.clear();
    for (const kycCase of refreshedKycCases) {
      if (kycCase.providerCustomerId) {
        kycCasesByProviderCustomer.set(kycCase.providerCustomerId, kycCase);
      }
    }

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
              statusExternal: customer.statusExternal,
              // Business tax id (CNPJ) only — lets the dashboard resume a pending company flow
              // without re-asking data the owner already supplied. Individual CPFs stay private.
              taxReference: customer.customerType === "business" ? customer.taxReference : null
            };
          }),
          id: entity.id,
          status: entity.status,
          type: entity.type
        };
      }),
      // Capability roles for role-gated dashboard UI (e.g. discount_manager invite fields).
      roles: profileRoles.map(profileRole => profileRole.role),
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
