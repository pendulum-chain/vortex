import {
  BrlaApiService,
  getOnboardingRequirements as findOnboardingRequirements,
  KycAttemptResult,
  KycAttemptStatus,
  ONBOARDING_REQUIREMENTS,
  OnboardingRequirementsCountry
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProfileRole from "../../models/profileRole.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { APIError } from "../errors/api-error";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { refreshAlfredpayCustomerStatus } from "../services/alfredpay/alfredpay-customer.service";
import {
  assertAveniaImportedTaxIdentity,
  hydrateAveniaCompanyName,
  updateAveniaKycOutcomeForCustomer,
  updateAveniaKycProgressForCustomer
} from "../services/avenia/avenia-customer.service";
import {
  mapAveniaKycAttemptStatus,
  reconcileAveniaIndividualKycStatusMethod
} from "../services/avenia/avenia-kyc-import.service";
import { selectActiveCustomerEntity } from "../services/customer-entity.service";
import { getMoneriumStatus, MONERIUM_REAUTHENTICATION_REQUIRED } from "../services/monerium/monerium.service";

// Provider status refreshes piggyback on the dashboard's 15s status poll; cap them per customer so
// polling (and multiple open tabs) doesn't hammer the providers. Marking at check time also dedupes
// concurrent polls. In-memory on purpose: per instance, the cap just multiplies by instance count.
const PROVIDER_REFRESH_TTL_MS = 60_000;
const lastProviderRefreshAt = new Map<string, number>();

/** GET /v1/onboarding/requirements - public metadata for an existing provider-specific flow. */
export function getOnboardingRequirements(req: Request, res: Response): void {
  const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "";
  const customerType = typeof req.query.customerType === "string" ? req.query.customerType.toLowerCase() : "";

  if (!country || (customerType !== "individual" && customerType !== "business")) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "INVALID_ONBOARDING_REQUIREMENTS_QUERY",
        message: "country and customerType (individual or business) are required",
        status: httpStatus.BAD_REQUEST
      }
    });
    return;
  }

  if (!(country in ONBOARDING_REQUIREMENTS)) {
    res.status(httpStatus.NOT_FOUND).json({
      error: {
        code: "ONBOARDING_REQUIREMENTS_NOT_FOUND",
        message: `No API-driven onboarding requirements are published for ${country} ${customerType}`,
        status: httpStatus.NOT_FOUND
      }
    });
    return;
  }

  const requirements = findOnboardingRequirements(country as OnboardingRequirementsCountry, customerType);
  if (!requirements) {
    res.status(httpStatus.NOT_FOUND).json({
      error: {
        code: "ONBOARDING_REQUIREMENTS_NOT_FOUND",
        message: `No API-driven onboarding requirements are published for ${country} ${customerType}`,
        status: httpStatus.NOT_FOUND
      }
    });
    return;
  }

  res.status(httpStatus.OK).json(requirements);
}

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
  const userId = getEffectiveUserId(req);
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
            !!customer.providerSubaccountId &&
            !!kycCasesByProviderCustomer.get(customer.id)?.providerCaseId &&
            shouldRefreshProviderStatus(customer.id)
        )
        .map(async customer => {
          const kycCase = kycCasesByProviderCustomer.get(customer.id);
          if (!kycCase?.providerCaseId || !customer.providerSubaccountId) return;
          try {
            const { attempt } = await BrlaApiService.getInstance().getKybAttemptStatus(
              kycCase.providerCaseId,
              customer.providerSubaccountId
            );
            if (attempt.id !== kycCase.providerCaseId) {
              // Integrity event, not a transient provider failure — mirror the KYB worker's
              // mismatch guard: log which attempt came back and leave local state untouched.
              logger.error(
                `Avenia returned attempt ${attempt.id} when asked for ${kycCase.providerCaseId}; skipping business status refresh`
              );
              return;
            }
            const approved = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED;
            const rejected =
              attempt.status === KycAttemptStatus.EXPIRED ||
              (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED);
            // A PENDING attempt is one the user never finished (hosted steps not completed) — keep it
            // pending so the dashboard offers Continue; in_review only once Avenia is PROCESSING.
            const refreshed =
              approved || rejected
                ? await updateAveniaKycOutcomeForCustomer(
                    customer,
                    approved ? VerificationStatus.Approved : VerificationStatus.Rejected,
                    attempt.status,
                    { id: kycCase.id, providerCaseId: kycCase.providerCaseId },
                    // When this poll wins the race to the terminal outcome, the authenticated
                    // route 409s and the KYB worker skips the settled case — so the failure
                    // reason and the outcome email must be persisted here or never.
                    { attempt, profileId: userId, subject: "business" }
                  )
                : await updateAveniaKycProgressForCustomer(
                    customer,
                    { id: kycCase.id, providerCaseId: kycCase.providerCaseId },
                    attempt.status === KycAttemptStatus.PENDING ? VerificationStatus.Pending : VerificationStatus.InReview,
                    attempt.status
                  );
            customer.set("status", refreshed.status);
            customer.set("statusExternal", refreshed.statusExternal);
          } catch (error) {
            const providerStatus =
              error && typeof error === "object" && "status" in error && typeof error.status === "number"
                ? error.status
                : undefined;
            logger.warn("Avenia business KYB status refresh failed", {
              errorName: error instanceof Error ? error.name : "UnknownError",
              providerCaseId: kycCase.providerCaseId,
              providerCustomerId: customer.id,
              providerStatus
            });
            // Status aggregation remains available while Avenia is temporarily unavailable.
          }
        })
    );

    // Avenia individual KYC: bound cases poll their exact attempt. Legacy standard cases
    // without a provider case id retain the list fallback until their next submission.
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
          try {
            const brlaApiService = BrlaApiService.getInstance();
            const reconciled = await reconcileAveniaIndividualKycStatusMethod(customer.id, brlaApiService);
            const kycCase = reconciled.kycCase;
            if (kycCase.verificationMethod === "sumsub_share_token" && !kycCase.providerCaseId) return;
            if (
              !kycCase.providerCaseId &&
              (kycCase.verificationSubmission?.status === "submitted" || kycCase.verificationSubmission?.status === "ambiguous")
            )
              return;
            const attempt = kycCase?.providerCaseId
              ? (
                  await brlaApiService.getVerificationAttemptStatus(
                    kycCase.providerCaseId,
                    customer.providerSubaccountId as string
                  )
                ).attempt
              : (await brlaApiService.getKycAttempts(customer.providerSubaccountId as string)).attempts[0];
            if (!attempt) return;
            if (kycCase?.providerCaseId && attempt.id !== kycCase.providerCaseId) return;
            if (attempt.status === KycAttemptStatus.COMPLETED && !attempt.result) {
              throw new Error("The provider returned an invalid KYC attempt state");
            }
            const approved = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED;
            const rejected =
              (kycCase?.verificationMethod === "sumsub_share_token" &&
                mapAveniaKycAttemptStatus(attempt) === VerificationStatus.Rejected) ||
              (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED);
            if (approved || rejected) {
              if (approved && kycCase.verificationMethod === "sumsub_share_token") {
                assertAveniaImportedTaxIdentity(
                  customer,
                  await brlaApiService.subaccountInfo(customer.providerSubaccountId as string)
                );
              }
              const refreshed = await updateAveniaKycOutcomeForCustomer(
                customer,
                approved ? VerificationStatus.Approved : VerificationStatus.Rejected,
                attempt.status,
                { id: kycCase.id, providerCaseId: kycCase.providerCaseId }
              );
              customer.set("status", refreshed.status);
              customer.set("statusExternal", refreshed.statusExternal);
            } else {
              const progressStatus =
                attempt.status === KycAttemptStatus.PENDING || attempt.status === KycAttemptStatus.EXPIRED
                  ? VerificationStatus.Pending
                  : VerificationStatus.InReview;
              const refreshed = await updateAveniaKycProgressForCustomer(
                customer,
                { id: kycCase.id, providerCaseId: kycCase.providerCaseId },
                progressStatus,
                attempt.status
              );
              customer.set("status", refreshed.status);
              customer.set("statusExternal", refreshed.statusExternal);
            }
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
