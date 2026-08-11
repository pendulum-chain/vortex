import {
  AveniaAccountType,
  AveniaDocumentResponse,
  AveniaDocumentType,
  AveniaKYCDataUpload,
  AveniaKYCDataUploadRequest,
  AveniaKybLevel1Payload,
  AveniaUboPayload,
  AveniaUboResponse,
  BrlaApiError,
  BrlaApiService,
  BrlaCreateSubaccountRequest,
  BrlaCreateSubaccountResponse,
  BrlaCurrency,
  BrlaErrorResponse,
  BrlaGetKycStatusRequest,
  BrlaGetKycStatusResponse,
  BrlaGetSelfieLivenessUrlRequest,
  BrlaGetSelfieLivenessUrlResponse,
  BrlaGetUserRemainingLimitRequest,
  BrlaGetUserRemainingLimitResponse,
  BrlaGetUserRequest,
  BrlaGetUserResponse,
  BrlaPostRecordInitialKycAttemptRequest,
  BrlaValidatePixKeyRequest,
  BrlaValidatePixKeyResponse,
  DocumentUploadRequest,
  DocumentUploadResponse,
  FiatToken,
  isValidCnpj,
  isValidCpf,
  KybAttemptStatusResponse,
  KybLevel1Response,
  KycAttemptResult,
  KycAttemptStatus,
  KycFailureReason,
  KycLevel1Payload,
  KycLevel1Response,
  normalizeTaxId,
  RampDirection
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import { ZodError } from "zod";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import QuoteTicket from "../../models/quoteTicket.model";
import { APIError } from "../errors/api-error";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import { assertQuoteOwnership } from "../middlewares/ownershipAuth";
import {
  accountTypeToCustomerType,
  customerTypeToAccountType,
  findAveniaCustomerBySubaccountId,
  findAveniaCustomerByTaxId,
  hashTaxReference,
  hydrateAveniaCompanyName,
  updateAveniaKycOutcome,
  upsertAveniaKycCase
} from "../services/avenia/avenia-customer.service";
import {
  AVENIA_IDENTITY_DOCUMENT_TYPES,
  assertAveniaKybCanSubmit,
  getOrCreateAveniaKybCase,
  requireReadyAveniaDocument,
  resolveOwnedAveniaBusinessAccount
} from "../services/avenia/avenia-kyb.service";
import { enqueueVerificationNotification } from "../services/avenia/verification-notifications";
import { resolveAveniaAccountForUser } from "../services/avenia-account";
import { findCustomerEntityIdsForProfile, getOrCreateCustomerEntityForProfile } from "../services/customer-entity.service";
import { runFinancialOperation } from "../services/phases/blocks/core/financial-operation";

// map from subaccountId → last interaction timestamp. Used for fetching the last relevant kyc event.
const _lastInteractionMap = new Map<string, number>();

// Maps webhook failure reasons to standardized enum values
function mapKycFailureReason(webhookReason: string | undefined): KycFailureReason {
  if (!webhookReason) {
    return KycFailureReason.UNKNOWN;
  }
  switch (true) {
    case webhookReason.includes("face match failure"):
      return KycFailureReason.FACE;
    case webhookReason.includes("name does not match"):
      return KycFailureReason.NAME;
    case webhookReason.includes("birthdate does not match"):
      return KycFailureReason.BIRTHDATE;
    case webhookReason.includes("tax id does not exist"):
      return KycFailureReason.TAX_ID;
    default:
      return KycFailureReason.UNKNOWN;
  }
}

// Helper function to use in the catch block of the controller functions.
function handleApiError(error: unknown, res: Response, apiMethod: string): void {
  logger.error(`Error while performing ${apiMethod}: `, error);

  if (error instanceof APIError) {
    res.status(error.status ?? httpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
    return;
  }

  if (error instanceof BrlaApiError && error.status !== 400) {
    res.status(httpStatus.BAD_GATEWAY).json({ error: "Avenia request failed" });
    return;
  }

  if (error instanceof ZodError) {
    res.status(httpStatus.BAD_GATEWAY).json({ error: "Avenia returned an invalid response" });
    return;
  }

  if (error instanceof Error && error.message.includes("status '400'")) {
    const splitError = error.message.split("Error: ", 2);
    if (splitError.length > 1) {
      const errorMessageString = splitError[1];
      try {
        const details = JSON.parse(errorMessageString);
        res.status(httpStatus.BAD_REQUEST).json({ details, error: "Invalid request" });
      } catch {
        res.status(httpStatus.BAD_REQUEST).json({ details: errorMessageString, error: "Invalid request" });
      }
    } else {
      res.status(httpStatus.BAD_REQUEST).json({ details: error.message, error: "Invalid request" });
    }
    return;
  }

  res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
    details: error instanceof Error ? error.message : "Unknown error",
    error: "Server error"
  });
}

/**
 * Retrieves a BRLA user's information based on Tax ID
 *
 * This endpoint fetches a user's subaccount information from the BRLA API service.
 * It validates that the user exists and has completed KYC level 1 verification.
 * If successful, it returns the user's EVM wallet address which is needed for offramp operations.
 *
 * @returns void - Sends JSON response with evmAddress on success, or appropriate error status
 *
 * @throws 400 - If taxId is missing
 * @throws 404 - If the subaccount cannot be found
 * @throws 500 - For any server-side errors during processing
 */
export const getAveniaUser = async (
  req: Request<unknown, unknown, unknown, BrlaGetUserRequest>,
  res: Response<BrlaGetUserResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId } = req.query;
    const effectiveUserId = getEffectiveUserId(req);

    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "Missing or invalid authentication."
      });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    let record: ProviderCustomer | null;

    if (taxId) {
      record = await findAveniaCustomerByTaxId(taxId);

      // Consulted records are analytics artifacts without a subaccount, not usable accounts.
      if (!record || record.status === VerificationStatus.Started || !record.providerSubaccountId) {
        res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
        return;
      }

      // Profile-level ownership: the record may live on any of the profile's entities
      // (migration 040 attached legacy rows to the individual entity), and a lookup must
      // not create an entity as a side effect.
      const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
      if (!ownedEntityIds.includes(record.customerEntityId)) {
        res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
        return;
      }
    } else {
      try {
        const resolved = await resolveAveniaAccountForUser(effectiveUserId);
        record = resolved.providerCustomer;
      } catch (error) {
        if (error instanceof APIError) {
          res.status(error.status ?? httpStatus.BAD_REQUEST).json({ error: error.message });
          return;
        }
        throw error;
      }
    }

    const subAccountId = record.providerSubaccountId ?? "";
    const accountInfo = await brlaApiService.subaccountInfo(subAccountId);
    if (!accountInfo) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount info not found" });
      return;
    }

    const kycLevel = accountInfo.accountInfo.identityStatus === "CONFIRMED" ? 1 : 0;
    res.json({
      evmAddress: accountInfo.wallets.find(w => w.chain === "EVM")?.walletAddress ?? "",
      identityStatus: accountInfo.accountInfo.identityStatus,
      kycLevel,
      subAccountId
    });
    return;
  } catch (error) {
    logger.info(error);
    if (
      error instanceof Error &&
      (error.message.includes("sub-account-id does not exist") || error.message.includes("sub-account-id is invalid"))
    ) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }
    handleApiError(error, res, "getAveniaUser");
  }
};

export const recordInitialKycAttempt = async (
  req: Request<unknown, unknown, BrlaPostRecordInitialKycAttemptRequest, unknown>,
  res: Response<Record<string, never> | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { quoteId, taxId } = req.body;
    const effectiveUserId = getEffectiveUserId(req);

    if (!quoteId || !taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing quoteId or taxId body parameter" });
      return;
    }

    // Bind the marker to a Brazil quote the caller owns. Without this an attacker could
    // plant a Consulted marker on another profile's tax id and block their subaccount creation.
    await assertQuoteOwnership(req, quoteId);
    const quote = await QuoteTicket.findByPk(quoteId);
    if (quote?.inputCurrency !== FiatToken.BRL && quote?.outputCurrency !== FiatToken.BRL) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "quoteId does not reference a Brazil onboarding quote" });
      return;
    }

    const existing = await findAveniaCustomerByTaxId(taxId);

    // provider_customers rows always have an owner, so anonymous callers cannot persist a
    // Consulted marker (the route requires auth in practice).
    if (!existing && effectiveUserId) {
      const accountType = isValidCnpj(taxId)
        ? AveniaAccountType.COMPANY
        : isValidCpf(taxId)
          ? AveniaAccountType.INDIVIDUAL
          : undefined;

      // Create the entry only if a valid taxId is provided. Otherwise we ignore the request.
      if (accountType) {
        const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId);
        const record = await ProviderCustomer.create({
          country: "BR",
          customerEntityId: entity.id,
          customerType: accountTypeToCustomerType(accountType),
          provider: "avenia",
          rail: "brl",
          status: VerificationStatus.Started,
          taxReference: normalizeTaxId(taxId),
          taxReferenceHash: hashTaxReference(taxId)
        });
        await upsertAveniaKycCase(record, VerificationStatus.Started);
      }
    }

    res.status(httpStatus.OK).json({});
  } catch (error) {
    res.status;
    handleApiError(error, res, "recordInitialKycAttempt");
  }
};

export const getAveniaUserRemainingLimit = async (
  req: Request<unknown, unknown, unknown, BrlaGetUserRemainingLimitRequest>,
  res: Response<BrlaGetUserRemainingLimitResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId, direction } = req.query;
    const effectiveUserId = getEffectiveUserId(req);

    if (!direction) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing direction query parameter" });
      return;
    }

    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "This endpoint requires authentication."
      });
      return;
    }

    let record: ProviderCustomer | null;
    if (taxId) {
      record = await findAveniaCustomerByTaxId(taxId);
      if (!record) {
        throw new APIError({
          message: "taxId does not match existing records",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Profile-level ownership. The legacy partner-key exemption that allowed reading
      // any taxId has been removed.
      const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
      if (!ownedEntityIds.includes(record.customerEntityId)) {
        res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
        return;
      }
    } else {
      try {
        const resolved = await resolveAveniaAccountForUser(effectiveUserId);
        record = resolved.providerCustomer;
      } catch (error) {
        if (error instanceof APIError) {
          res.status(error.status ?? httpStatus.BAD_REQUEST).json({ error: error.message });
          return;
        }
        throw error;
      }
    }

    const brlaApiService = BrlaApiService.getInstance();
    const limitsData = await brlaApiService.getSubaccountUsedLimit(record.providerSubaccountId ?? "");

    if (!limitsData || !limitsData.limitInfo || !limitsData.limitInfo.limits) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Limits not found" });
      return;
    }

    const brlLimits = limitsData.limitInfo.limits.find(limit => limit.currency === BrlaCurrency.BRL);

    if (!brlLimits) {
      // Our current assumption is that BRL limits won't exist for an account without a KYC.
      // But to be safe, we check the status and return a proper status.
      const accountInfo = await brlaApiService.subaccountInfo(record.providerSubaccountId ?? "");
      if (!accountInfo || accountInfo.accountInfo.identityStatus !== "CONFIRMED") {
        res.status(httpStatus.BAD_REQUEST).json({ error: "KYC invalid" });
        return;
      }

      res.status(httpStatus.NOT_FOUND).json({ error: "BRL limits not found" });
      return;
    }

    let remainingLimit = 0;
    if (direction === RampDirection.BUY) {
      remainingLimit = Number(brlLimits.maxFiatIn) - Number(brlLimits.usedLimit.usedFiatIn);
    } else if (direction === RampDirection.SELL) {
      remainingLimit = Number(brlLimits.maxFiatOut) - Number(brlLimits.usedLimit.usedFiatOut);
    }

    res.json({ remainingLimit: remainingLimit < 0 ? 0 : remainingLimit });
    return;
  } catch (error) {
    handleApiError(error, res, "getAveniaUserRemainingLimit");
  }
};

export const createSubaccount = async (
  req: Request<unknown, unknown, BrlaCreateSubaccountRequest>,
  res: Response<BrlaCreateSubaccountResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { name, taxId, accountType: requestAccountType } = req.body;
    const effectiveUserId = getEffectiveUserId(req);

    // Reject callers that do not resolve to a user (anonymous requests
    // or unlinked secret keys) so the resulting provider customer is owned by a real profile.
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "This endpoint requires authentication."
      });
      return;
    }

    const isCnpj = isValidCnpj(taxId);

    // normalize taxId for further operations
    const normalizedTaxId = normalizeTaxId(taxId);
    // Use the accountType from the request if provided, otherwise determine from taxId
    const accountType = requestAccountType || (isCnpj ? AveniaAccountType.COMPANY : AveniaAccountType.INDIVIDUAL);

    if (req.managedProfileContext) {
      const entity = await CustomerEntity.findByPk(req.managedProfileContext.customerEntityId, { attributes: ["type"] });
      if (entity?.type !== accountTypeToCustomerType(accountType)) {
        res.status(httpStatus.CONFLICT).json({ error: "The account type does not match the managed profile" });
        return;
      }
    }

    const taxReferenceHash = hashTaxReference(normalizedTaxId);
    const existingSubaccount = await sequelize.transaction(async transaction => {
      // A tax id has no row to lock on the first request. A transaction-scoped advisory
      // lock keeps ownership/canonical-account inspection consistent with persistence.
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
        replacements: { key: `avenia-subaccount:${taxReferenceHash}` },
        transaction
      });

      // Read only after acquiring the lock. Ownership is profile-level, not typed-entity-level:
      // migration 040 left business rows on the profile's individual entity.
      const existing = await findAveniaCustomerByTaxId(normalizedTaxId, transaction);
      if (
        existing &&
        !(await findCustomerEntityIdsForProfile(effectiveUserId, transaction)).includes(existing.customerEntityId)
      ) {
        throw new APIError({
          isPublic: true,
          message: "A subaccount already exists for this taxId",
          status: httpStatus.CONFLICT
        });
      }

      // The provider subaccount is the canonical external identity. Normal retries repair
      // missing local KYC state but must never create a replacement or reset verification.
      if (existing?.providerSubaccountId) {
        await upsertAveniaKycCase(existing, existing.status, existing.statusExternal, undefined, transaction);
        return existing.providerSubaccountId;
      }
      return null;
    });

    if (existingSubaccount) {
      res.status(httpStatus.OK).json({ subAccountId: existingSubaccount });
      return;
    }

    // Avenia does not accept an idempotency key for subaccount creation. The durable
    // operation claim therefore acts as the exactly-once boundary: confirmed results can
    // repair local persistence, while submitted/unknown outcomes require reconciliation
    // instead of issuing a second provider POST.
    const brlaApiService = BrlaApiService.getInstance();
    const { id } = await runFinancialOperation({
      attemptClass: "provider-account-create",
      externalId: result => result.id,
      flow: { id: "avenia-subaccount-provisioning", version: 1 },
      perform: () => brlaApiService.createAveniaSubaccount(accountType, name),
      phase: "createSubaccount",
      provider: "avenia",
      request: {
        accountType,
        name: name.trim(),
        ownerProfileId: effectiveUserId,
        taxReferenceHash
      },
      scopeId: taxReferenceHash,
      scopeType: "profile"
    });

    let companyName: string | null = null;
    if (accountType === AveniaAccountType.COMPANY) {
      companyName = name.trim();
      try {
        const account = await brlaApiService.subaccountInfo(id);
        companyName = account?.accountInfo.name?.trim() || account?.accountInfo.fullName?.trim() || companyName;
      } catch {
        // The accepted request name remains usable if the follow-up provider read is temporarily unavailable.
      }
    }

    const subAccountId = await sequelize.transaction(async transaction => {
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
        replacements: { key: `avenia-subaccount:${taxReferenceHash}` },
        transaction
      });

      let existing = await findAveniaCustomerByTaxId(normalizedTaxId, transaction);
      if (
        existing &&
        !(await findCustomerEntityIdsForProfile(effectiveUserId, transaction)).includes(existing.customerEntityId)
      ) {
        throw new APIError({
          isPublic: true,
          message: "A subaccount already exists for this taxId",
          status: httpStatus.CONFLICT
        });
      }
      if (existing?.providerSubaccountId) {
        if (existing.providerSubaccountId !== id) {
          throw new APIError({
            isPublic: true,
            message: "The canonical Avenia subaccount differs from the confirmed creation result",
            status: httpStatus.CONFLICT
          });
        }
        await upsertAveniaKycCase(existing, existing.status, existing.statusExternal, undefined, transaction);
        return existing.providerSubaccountId;
      }

      const initialStatus =
        accountType === AveniaAccountType.COMPANY ? VerificationStatus.Pending : VerificationStatus.InReview;
      if (existing) {
        await existing.update(
          {
            companyName,
            customerType: accountTypeToCustomerType(accountType),
            providerSubaccountId: id,
            status: initialStatus,
            statusExternal: null
          },
          { transaction }
        );
      } else {
        const entity = await getOrCreateCustomerEntityForProfile(
          effectiveUserId,
          accountTypeToCustomerType(accountType),
          transaction
        );
        existing = await ProviderCustomer.create(
          {
            companyName,
            country: "BR",
            customerEntityId: entity.id,
            customerType: accountTypeToCustomerType(accountType),
            provider: "avenia",
            providerSubaccountId: id,
            rail: "brl",
            status: initialStatus,
            taxReference: normalizedTaxId,
            taxReferenceHash
          },
          { transaction }
        );
      }
      await upsertAveniaKycCase(existing, initialStatus, null, undefined, transaction);
      return id;
    });

    res.status(httpStatus.OK).json({ subAccountId });
  } catch (error) {
    logger.error("Error creating subaccount:", error);
    handleApiError(error, res, "createSubaccount");
  }
};

export const fetchSubaccountKycStatus = async (
  req: Request<unknown, unknown, unknown, BrlaGetKycStatusRequest>,
  res: Response<BrlaGetKycStatusResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId" });
      return;
    }

    const record = await findAveniaCustomerByTaxId(taxId);
    if (!record) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    // Profile-level ownership: this endpoint both reads KYC state and drives status
    // transitions, so it must not be usable against another user's account.
    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "This endpoint requires authentication." });
      return;
    }
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(record.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }

    const subAccountId = record.providerSubaccountId ?? "";
    // Backfill `companyName` for business rows created before the field was populated
    // (mirrors the onboarding aggregation's lazy hydration so KYC-only callers recover too).
    await hydrateAveniaCompanyName(record);
    const brlaApiService = BrlaApiService.getInstance();
    const kycAttemptStatuses = await brlaApiService.getKycAttempts(subAccountId);
    const kycAttemptStatus = kycAttemptStatuses.attempts[0]; // Get the latest attempt
    if (!kycAttemptStatus) {
      const accountInfo = await brlaApiService.subaccountInfo(subAccountId);
      if (accountInfo?.accountInfo.identityStatus === "CONFIRMED") {
        res.status(httpStatus.OK).json({
          level: "KYC_1",
          result: KycAttemptResult.APPROVED,
          status: KycAttemptStatus.COMPLETED,
          type: "KYC"
        });

        // Also try updating in case we missed the attempt
        await updateAveniaKycOutcome(taxId, VerificationStatus.Approved, accountInfo.accountInfo.identityStatus);
        return;
      }

      await record.update({ status: VerificationStatus.Pending, statusExternal: null });
      await upsertAveniaKycCase(record, VerificationStatus.Pending, null);
      res.status(httpStatus.NOT_FOUND).json({ error: "KYC attempt not found" });
      return;
    }

    // Update our internal status based on the KYC result.
    if (kycAttemptStatus.result === KycAttemptResult.APPROVED) {
      await updateAveniaKycOutcome(taxId, VerificationStatus.Approved, kycAttemptStatus.status);
    }
    if (kycAttemptStatus.result === KycAttemptResult.REJECTED) {
      await updateAveniaKycOutcome(taxId, VerificationStatus.Rejected, kycAttemptStatus.status);
    }
    // No result yet: mirror the in-flight attempt. This includes a `rejected` account whose
    // owner retries — the fresh attempt puts it back in review so the outcome poll can decide.
    if (!kycAttemptStatus.result && record.status !== VerificationStatus.Approved) {
      const status =
        kycAttemptStatus.status === KycAttemptStatus.EXPIRED ? VerificationStatus.Pending : VerificationStatus.InReview;
      await record.update({ status, statusExternal: kycAttemptStatus.status });
      await upsertAveniaKycCase(record, status, kycAttemptStatus.status);
    }

    res.status(httpStatus.OK).json({
      failureReason: mapKycFailureReason(kycAttemptStatus.resultMessage),
      level: kycAttemptStatus.levelName,
      result: kycAttemptStatus.result,
      status: kycAttemptStatus.status,
      type: "KYC"
    });
  } catch (error) {
    handleApiError(error, res, "fetchSubaccountKycStatus");
  }
};

/**
 * Validates a pix key
 *
 * Uses BRLA's API to validate a pix key, returning valid if it exists
 * or a 400 error if it does not or is not valid.
 * Purposely does not return the pix key itself for security reasons.
 *
 * @returns Sends a valid boolean field.
 *
 * @throws 400 - If pix key is missing, invalid or does not exist.
 * @throws 500 - For any server-side errors during processing
 */
export const validatePixKey = async (
  req: Request<unknown, unknown, unknown, BrlaValidatePixKeyRequest>,
  res: Response<BrlaValidatePixKeyResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { pixKey } = req.query;

    if (!pixKey) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "pixKey must be provided" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    await brlaApiService.validatePixKey(pixKey);

    res.status(httpStatus.OK).json({ valid: true });
  } catch (error) {
    handleApiError(error, res, "validatePixKey");
  }
};

export const getSelfieLivenessUrl = async (
  req: Request<unknown, unknown, unknown, BrlaGetSelfieLivenessUrlRequest>,
  res: Response<BrlaGetSelfieLivenessUrlResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId" });
      return;
    }

    const record = await findAveniaCustomerByTaxId(taxId);
    if (!record) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Ramp disabled" });
      return;
    }

    // Profile-level ownership: liveness URLs act on the account's KYC flow.
    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "This endpoint requires authentication." });
      return;
    }
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(record.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();

    const selfieUrl = await brlaApiService.getDocumentUploadUrls(
      AveniaDocumentType.SELFIE_FROM_LIVENESS,
      false,
      record.providerSubaccountId ?? ""
    );

    res.status(httpStatus.OK).json({
      id: selfieUrl.id,
      livenessUrl: selfieUrl.livenessUrl ?? "",
      uploadURLFront: selfieUrl.uploadURLFront,
      validateLivenessToken: selfieUrl.validateLivenessToken ?? ""
    });
  } catch (error) {
    logger.error(error);
    handleApiError(error, res, "getSelfieLivenessUrl");
  }
};

/**
 * Gets the upload URLs for KYC documents
 *
 *
 * @returns Returns 200 with the upload URLs for the KYC documents.
 *
 * @throws 400 - User does not exist, or is not yet KYC level 1 verified.
 * @throws 500 - For any server-side errors during processing.
 */

export const getUploadUrls = async (
  req: Request<unknown, unknown, AveniaKYCDataUploadRequest>,
  res: Response<AveniaKYCDataUpload | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { documentType, taxId } = req.body;

    if (!documentType) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing documentType" });
      return;
    }

    if (documentType !== AveniaDocumentType.ID && documentType !== AveniaDocumentType.DRIVERS_LICENSE) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid documentType" });
      return;
    }

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId" });
      return;
    }

    const record = await findAveniaCustomerByTaxId(taxId);
    if (!record) {
      // Invalid state. Cannot happen since we create the subaccount first for every tax.
      res.status(httpStatus.BAD_REQUEST).json({ error: "Ramp disabled" });
      return;
    }

    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    // Profile-level ownership: legacy business rows live on the profile's individual
    // entity, so the owning entity's type cannot gate access — and a read path must not
    // findOrCreate an entity as a side effect.
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(record.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }

    const subAccountId = record.providerSubaccountId ?? "";
    const brlaApiService = BrlaApiService.getInstance();

    const selfieUrl = await brlaApiService.getDocumentUploadUrls(AveniaDocumentType.SELFIE_FROM_LIVENESS, false, subAccountId);

    // assume RG is double sided, CNH is not.
    const isDoubleSided = documentType === AveniaDocumentType.ID ? true : false;

    const idUrls = await brlaApiService.getDocumentUploadUrls(documentType, isDoubleSided, subAccountId);

    res.status(httpStatus.OK).json({
      idUpload: {
        id: idUrls.id,
        uploadURLBack: idUrls.uploadURLBack,
        uploadURLFront: idUrls.uploadURLFront
      },
      selfieUpload: {
        id: selfieUrl.id,
        livenessUrl: selfieUrl.livenessUrl,
        uploadURLFront: selfieUrl.uploadURLFront,
        validateLivenessToken: selfieUrl.validateLivenessToken
      }
    });
  } catch (error) {
    logger.error(error);
    handleApiError(error, res, "getUploadUrls");
  }
};

export const newKyc = async (
  req: Request<unknown, unknown, KycLevel1Payload>,
  res: Response<KycLevel1Response | BrlaErrorResponse>
): Promise<void> => {
  try {
    const brlaApiService = BrlaApiService.getInstance();
    const subAccountId = req.body.subAccountId;

    if (!subAccountId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing subAccountId" });
      return;
    }

    const record = await findAveniaCustomerBySubaccountId(subAccountId);
    if (!record) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    // Profile-level ownership.
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(record.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }

    // Wait for previously uploaded documents to propagate before submitting KYC
    await new Promise(resolve => setTimeout(resolve, 5000));
    await brlaApiService.getUploadedDocuments(subAccountId);
    const response = await brlaApiService.submitKycLevel1(req.body);

    res.status(httpStatus.OK).json(response);
  } catch (error) {
    handleApiError(error, res, "newKyc");
  }
};

async function resolveAveniaKybAccount(
  req: Pick<Request, "credential" | "userId">,
  subAccountId: string | undefined
): Promise<ProviderCustomer> {
  const effectiveUserId = getEffectiveUserId(req);
  if (!effectiveUserId) {
    throw new APIError({ message: "This endpoint requires authentication.", status: httpStatus.BAD_REQUEST });
  }
  return resolveOwnedAveniaBusinessAccount(effectiveUserId, subAccountId);
}

export const createKybDocument = async (
  req: Request<unknown, unknown, DocumentUploadRequest, { subAccountId?: string }>,
  res: Response<DocumentUploadResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const record = await resolveAveniaKybAccount(req, req.query.subAccountId);
    const response = await BrlaApiService.getInstance().getDocumentUploadUrls(
      req.body.documentType,
      req.body.isDoubleSided ?? false,
      record.providerSubaccountId as string
    );
    res.status(httpStatus.CREATED).json(response);
  } catch (error) {
    handleApiError(error, res, "createKybDocument");
  }
};

export const getKybDocument = async (
  req: Request<{ documentId: string }, unknown, unknown, { subAccountId?: string }>,
  res: Response
): Promise<void> => {
  try {
    const record = await resolveAveniaKybAccount(req, req.query.subAccountId);
    const response: AveniaDocumentResponse = await BrlaApiService.getInstance().getUploadedDocument(
      req.params.documentId,
      record.providerSubaccountId as string
    );
    if (response.document.id !== req.params.documentId) {
      throw new APIError({ message: "Avenia returned a mismatched document", status: httpStatus.BAD_GATEWAY });
    }
    const { document } = response;
    res.status(httpStatus.OK).json({
      document: {
        documentType: document.documentType,
        id: document.id,
        ready: document.ready,
        ...(document.uploadErrorBack ? { uploadErrorBack: document.uploadErrorBack } : {}),
        ...(document.uploadErrorFront ? { uploadErrorFront: document.uploadErrorFront } : {}),
        ...(document.uploadStatusBack ? { uploadStatusBack: document.uploadStatusBack } : {}),
        uploadStatusFront: document.uploadStatusFront
      }
    });
  } catch (error) {
    handleApiError(error, res, "getKybDocument");
  }
};

export const createKybUbo = async (
  req: Request<unknown, unknown, AveniaUboPayload, { subAccountId?: string }>,
  res: Response<AveniaUboResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const record = await resolveAveniaKybAccount(req, req.query.subAccountId);
    const brlaApiService = BrlaApiService.getInstance();
    const subAccountId = record.providerSubaccountId as string;
    await requireReadyAveniaDocument(
      brlaApiService,
      subAccountId,
      req.body.uploadedIdentificationId,
      AVENIA_IDENTITY_DOCUMENT_TYPES
    );
    if (req.body.uploadedSelfieId) {
      await requireReadyAveniaDocument(brlaApiService, subAccountId, req.body.uploadedSelfieId, [
        AveniaDocumentType.SELFIE_FROM_LIVENESS
      ]);
    }
    const response = await brlaApiService.createUbo(req.body, subAccountId);
    res.status(httpStatus.CREATED).json(response);
  } catch (error) {
    handleApiError(error, res, "createKybUbo");
  }
};

export const submitKybLevel1Api = async (
  req: Request<unknown, unknown, AveniaKybLevel1Payload, { subAccountId?: string }>,
  res: Response<KycLevel1Response | BrlaErrorResponse>
): Promise<void> => {
  try {
    const record = await resolveAveniaKybAccount(req, req.query.subAccountId);
    const subAccountId = record.providerSubaccountId as string;
    const brlaApiService = BrlaApiService.getInstance();
    await assertAveniaKybCanSubmit(brlaApiService, record, subAccountId);
    const kycCase = await getOrCreateAveniaKybCase(record);
    await Promise.all([
      requireReadyAveniaDocument(brlaApiService, subAccountId, req.body.certificateOfIncorporationDocumentId, [
        AveniaDocumentType.CERTIFICATE_OF_INCORPORATION
      ]),
      requireReadyAveniaDocument(brlaApiService, subAccountId, req.body.taxIdentificationDocumentId, [
        AveniaDocumentType.COMPANY_TAX_IDENTIFICATION_DOCUMENT
      ])
    ]);

    const response = await brlaApiService.submitKybLevel1(req.body, subAccountId);

    const now = new Date();
    await sequelize.transaction(async transaction => {
      await record.update(
        {
          lastFailureReasons: [],
          status: VerificationStatus.Pending,
          statusExternal: KycAttemptStatus.PENDING
        },
        { transaction }
      );
      await kycCase.update(
        {
          approvedAt: null,
          failureReasons: [],
          providerCaseId: response.id,
          rejectedAt: null,
          status: VerificationStatus.Pending,
          statusExternal: KycAttemptStatus.PENDING,
          submittedAt: now
        },
        { transaction }
      );
    });
    res.status(httpStatus.OK).json(response);
  } catch (error) {
    handleApiError(error, res, "submitKybLevel1Api");
  }
};

/**
 * Initiates KYB Level 1 verification process using the Web SDK
 *
 * @returns Returns 200 with URLs for the KYB verification process
 *
 * @throws 400 - If subAccountId is missing
 * @throws 500 - For any server-side errors during processing
 */
export const initiateKybLevel1 = async (
  req: Request<unknown, { redirectUrl: string }, unknown, { subAccountId?: string }>,
  res: Response<KybLevel1Response | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { subAccountId } = req.query;

    if (!subAccountId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing subAccountId" });
      return;
    }

    const record = await findAveniaCustomerBySubaccountId(subAccountId);
    if (!record) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    // Profile-level ownership: KYB business rows migrated by 040 live on the individual entity.
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(record.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }

    const accountType = customerTypeToAccountType(record.customerType);
    if (accountType !== AveniaAccountType.COMPANY) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "KYB Level 1 is only available for COMPANY accounts. This account is registered as " + accountType
      });
      return;
    }

    if (record.status === VerificationStatus.Approved) {
      res.status(httpStatus.CONFLICT).json({ error: "This company is already approved" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    await assertAveniaKybCanSubmit(brlaApiService, record, subAccountId);
    const response = await brlaApiService.initiateKybLevel1(subAccountId);
    // The attempt starts PENDING at Avenia — nothing is submitted until the user finishes the hosted
    // steps — so our status stays pending (dashboard keeps offering Continue). in_review is set only
    // once Avenia reports PROCESSING.
    await record.update({ status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING });
    // The attempt id persisted here is what the KYB status worker polls; without it the
    // outcome is never observed and no verification email is sent.
    await upsertAveniaKycCase(record, VerificationStatus.Pending, KycAttemptStatus.PENDING, response.attemptId);

    res.status(httpStatus.OK).json(response);
  } catch (error) {
    handleApiError(error, res, "initiateKybLevel1");
  }
};

/**
 * Gets the status of a KYB attempt
 *
 * @returns Returns 200 with the KYB attempt status
 *
 * @throws 400 - If attemptId is missing
 * @throws 500 - For any server-side errors during processing
 */
export const getKybAttemptStatus = async (
  req: Request<unknown, unknown, unknown, { attemptId: string }>,
  res: Response<KybAttemptStatusResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { attemptId } = req.query;

    if (!attemptId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing attemptId" });
      return;
    }

    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "This endpoint requires authentication." });
      return;
    }

    const kycCase = await KycCase.findOne({
      where: { provider: "avenia", providerCaseId: attemptId, type: "kyb" }
    });
    if (!kycCase) {
      res.status(httpStatus.NOT_FOUND).json({ error: "KYB attempt not found" });
      return;
    }

    // Profile-level ownership: legacy business rows live on the profile's individual
    // entity, so the owning entity's type cannot gate access — and a read path must not
    // findOrCreate an entity as a side effect.
    const ownedEntityIds = await findCustomerEntityIdsForProfile(effectiveUserId);
    if (!ownedEntityIds.includes(kycCase.customerEntityId)) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This KYB attempt is not linked to your user profile." });
      return;
    }

    const record = kycCase.providerCustomerId ? await ProviderCustomer.findByPk(kycCase.providerCustomerId) : null;
    if (
      !record ||
      !record.providerSubaccountId ||
      !ownedEntityIds.includes(record.customerEntityId) ||
      record.provider !== "avenia"
    ) {
      res.status(httpStatus.NOT_FOUND).json({ error: "KYB account not found" });
      return;
    }

    if (record.status === VerificationStatus.Approved) {
      res
        .status(httpStatus.OK)
        .json({ result: KycAttemptResult.APPROVED, retryable: false, status: KycAttemptStatus.COMPLETED });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const response = await brlaApiService.getKybAttemptStatus(attemptId, record.providerSubaccountId);
    const attempt = response.attempt;
    if (attempt.id !== attemptId) {
      throw new APIError({ message: "Avenia returned a mismatched KYB attempt", status: httpStatus.BAD_GATEWAY });
    }

    const approved = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED;
    const rejected =
      attempt.status === KycAttemptStatus.EXPIRED ||
      (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED);
    const normalizedStatus = approved
      ? VerificationStatus.Approved
      : rejected
        ? VerificationStatus.Rejected
        : attempt.status === KycAttemptStatus.PROCESSING
          ? VerificationStatus.InReview
          : VerificationStatus.Pending;
    const failureReason = rejected ? mapKycFailureReason(attempt.resultMessage) : undefined;
    const lifecycle = {
      ...(approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
      ...(rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
    };
    const nonTerminalStatuses = [VerificationStatus.Pending, VerificationStatus.Started, VerificationStatus.InReview];
    const updateWhere = {
      id: kycCase.id,
      providerCaseId: attemptId,
      status: { [Op.in]: nonTerminalStatuses },
      ...(attempt.status === KycAttemptStatus.PENDING
        ? { [Op.or]: [{ statusExternal: null }, { statusExternal: KycAttemptStatus.PENDING }] }
        : attempt.status === KycAttemptStatus.PROCESSING
          ? {
              [Op.or]: [
                { statusExternal: null },
                { statusExternal: { [Op.in]: [KycAttemptStatus.PENDING, KycAttemptStatus.PROCESSING] } }
              ]
            }
          : {})
    };

    const persisted = await sequelize.transaction(async transaction => {
      const [updatedCases] = await KycCase.update(
        {
          failureReasons: failureReason ? [failureReason] : [],
          status: normalizedStatus,
          statusExternal: attempt.status,
          ...lifecycle
        },
        { transaction, where: updateWhere }
      );
      if (updatedCases !== 1) {
        return false;
      }

      // Queue only after proving this is still the bound attempt. A queue failure rolls
      // back the terminal state so a later poll can retry the notification.
      await enqueueVerificationNotification(attempt, effectiveUserId, "business");
      await record.update(
        {
          lastFailureReasons: failureReason ? [failureReason] : [],
          status: normalizedStatus,
          statusExternal: attempt.status
        },
        { transaction }
      );
      return true;
    });
    if (!persisted) {
      throw new APIError({ message: "This KYB attempt is no longer current", status: httpStatus.CONFLICT });
    }

    res.status(httpStatus.OK).json({
      ...(failureReason ? { failureReason } : {}),
      ...(attempt.result ? { result: attempt.result } : {}),
      retryable: attempt.retryable,
      status: attempt.status
    });
  } catch (error) {
    handleApiError(error, res, "getKybAttemptStatus");
  }
};
