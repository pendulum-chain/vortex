import {
  AveniaAccountType,
  AveniaDocumentType,
  AveniaKYCDataUpload,
  AveniaKYCDataUploadRequest,
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
import logger from "../../config/logger";
import KycCase from "../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import TaxId, { TaxIdInternalStatus } from "../../models/taxId.model";
import { APIError } from "../errors/api-error";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
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
import { resolveAveniaAccountForUser } from "../services/avenia-account";
import { getOrCreateCustomerEntityForProfile } from "../services/customer-entity.service";

// map from subaccountId → last interaction timestamp. Used for fetching the last relevant kyc event.
const _lastInteractionMap = new Map<string, number>();

function legacyAveniaStatus(status: TaxIdInternalStatus | null): VerificationStatus {
  switch (status) {
    case TaxIdInternalStatus.Accepted:
      return VerificationStatus.Approved;
    case TaxIdInternalStatus.Rejected:
      return VerificationStatus.Rejected;
    case TaxIdInternalStatus.Requested:
      return VerificationStatus.InReview;
    case TaxIdInternalStatus.Consulted:
      return VerificationStatus.Started;
    default:
      return VerificationStatus.Pending;
  }
}

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

      // The account must be owned by the effective user's customer entity.
      const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId);
      if (record.customerEntityId !== entity.id) {
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
    const { taxId } = req.body;
    const effectiveUserId = getEffectiveUserId(req);

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId query parameters" });
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

      // The account must be owned by the effective user. The legacy partner-key
      // exemption that allowed reading any taxId has been removed.
      const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId);
      if (record.customerEntityId !== entity.id) {
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
    // or unlinked secret keys) so the resulting TaxId is always owned by a real profile.
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

    const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId, accountTypeToCustomerType(accountType));

    // Ownership check BEFORE calling the BRLA API to avoid creating a stranded subaccount
    // on every conflict and to prevent account-takeover via subAccountId overwrite.
    let existing = await findAveniaCustomerByTaxId(normalizedTaxId);
    if (existing && existing.customerEntityId !== entity.id) {
      res.status(httpStatus.CONFLICT).json({
        error: "A subaccount already exists for this taxId"
      });
      return;
    }

    // Legacy adoption: quarantined rows in the tax_ids backup (created before the
    // provider_customers cutover, possibly ownerless) are claimable exactly like the
    // pre-cutover flow allowed — owned-by-another rejects, anonymous rows are claimed
    // by the authenticated caller. One-time per row; the backup itself is never written.
    if (!existing) {
      const legacy = await TaxId.findByPk(normalizedTaxId);
      if (legacy && legacy.internalStatus !== TaxIdInternalStatus.Consulted) {
        if (legacy.userId !== null && legacy.userId !== effectiveUserId) {
          res.status(httpStatus.CONFLICT).json({
            error: "A subaccount already exists for this taxId"
          });
          return;
        }
        existing = await ProviderCustomer.create({
          country: "BR",
          customerEntityId: entity.id,
          customerType: accountTypeToCustomerType(legacy.accountType),
          provider: "avenia",
          providerSubaccountId: legacy.subAccountId || null,
          rail: "brl",
          status: legacyAveniaStatus(legacy.internalStatus),
          taxReference: normalizedTaxId,
          taxReferenceHash: hashTaxReference(normalizedTaxId)
        });
      }
    }

    const brlaApiService = BrlaApiService.getInstance();
    const { id } = await brlaApiService.createAveniaSubaccount(accountType, name);
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

    // A company has no verification attempt yet at this point — the hosted KYB links are issued in
    // a follow-up call — so it starts pending (resumable). Individuals keep the legacy Requested
    // semantics (in_review until the outcome poll decides).
    const initialStatus = accountType === AveniaAccountType.COMPANY ? VerificationStatus.Pending : VerificationStatus.InReview;
    if (existing) {
      await existing.update({
        companyName,
        customerType: accountTypeToCustomerType(accountType),
        providerSubaccountId: id,
        status: initialStatus,
        statusExternal: null
      });
    } else {
      // The entry should have been created the very first a new cpf/cnpj is consulted.
      // We leave this as is for now to avoid breaking changes.
      existing = await ProviderCustomer.create({
        companyName,
        country: "BR",
        customerEntityId: entity.id,
        customerType: accountTypeToCustomerType(accountType),
        provider: "avenia",
        providerSubaccountId: id,
        rail: "brl",
        status: initialStatus,
        taxReference: normalizedTaxId,
        taxReferenceHash: hashTaxReference(normalizedTaxId)
      });
    }
    await upsertAveniaKycCase(existing, initialStatus, null);

    res.status(httpStatus.OK).json({ subAccountId: id });
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

    // Ownership: this endpoint both reads KYC state and drives status transitions, so it
    // must not be usable against another user's account.
    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "This endpoint requires authentication." });
      return;
    }
    const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId);
    if (record.customerEntityId !== entity.id) {
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

    // Ownership: liveness URLs act on the account's KYC flow.
    const effectiveUserId = getEffectiveUserId(req);
    if (!effectiveUserId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "This endpoint requires authentication." });
      return;
    }
    const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId);
    if (record.customerEntityId !== entity.id) {
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

    if (!req.userId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    const entity = await getOrCreateCustomerEntityForProfile(req.userId, "business");
    if (record.customerEntityId !== entity.id) {
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

    if (!req.userId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    const entity = await getOrCreateCustomerEntityForProfile(req.userId);
    if (record.customerEntityId !== entity.id) {
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

    if (!req.userId) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This tax ID is not linked to your user profile and cannot be used." });
      return;
    }
    const entity = await getOrCreateCustomerEntityForProfile(req.userId);
    if (record.customerEntityId !== entity.id) {
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

    const existingKybCase = await KycCase.findOne({
      where: { providerCustomerId: record.id, type: "kyb" }
    });
    // A PENDING attempt means the user never completed Avenia's hosted steps. The hosted URLs are
    // not stored, so re-initiation is the only way to surface them again — allow it and rebind the
    // case to the fresh attempt. Only an attempt Avenia is processing (or has decided) blocks.
    if (
      existingKybCase?.providerCaseId &&
      record.status !== VerificationStatus.Rejected &&
      existingKybCase.statusExternal !== KycAttemptStatus.EXPIRED &&
      existingKybCase.statusExternal !== KycAttemptStatus.PENDING
    ) {
      res.status(httpStatus.CONFLICT).json({ error: "A KYB attempt is already in progress" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();

    // The stored status can lag (the hosted steps may have just been finished in another tab):
    // probe the live attempt before re-initiating so a processing/approved attempt is not
    // orphaned by rebinding the case to a fresh one. A rejected decision stays re-initiable
    // (that is the retry path), and a failing probe must not lock the user out of resuming.
    if (existingKybCase?.providerCaseId) {
      try {
        const { attempt } = await brlaApiService.getKybAttemptStatus(existingKybCase.providerCaseId);
        const decidedRejected = attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED;
        const resumable =
          attempt.status === KycAttemptStatus.PENDING || attempt.status === KycAttemptStatus.EXPIRED || decidedRejected;
        if (!resumable) {
          res.status(httpStatus.CONFLICT).json({ error: "A KYB attempt is already in progress" });
          return;
        }
      } catch {
        // Re-initiation is the only path back to the hosted steps; keep it available if the probe fails.
      }
    }

    const response = await brlaApiService.initiateKybLevel1(subAccountId);
    // The attempt starts PENDING at Avenia — nothing is submitted until the user finishes the hosted
    // steps — so our status stays pending (dashboard keeps offering Continue). in_review is set only
    // once Avenia reports PROCESSING.
    await record.update({ status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING });
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

    const entity = await getOrCreateCustomerEntityForProfile(effectiveUserId, "business");
    if (kycCase.customerEntityId !== entity.id) {
      res.status(httpStatus.FORBIDDEN).json({ error: "This KYB attempt is not linked to your user profile." });
      return;
    }

    const record = kycCase.providerCustomerId ? await ProviderCustomer.findByPk(kycCase.providerCustomerId) : null;
    if (!record || record.customerEntityId !== entity.id || record.provider !== "avenia") {
      res.status(httpStatus.NOT_FOUND).json({ error: "KYB account not found" });
      return;
    }

    if (record.status === VerificationStatus.Approved) {
      res.status(httpStatus.OK).json({ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const response = await brlaApiService.getKybAttemptStatus(attemptId);
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

    await record.update({
      lastFailureReasons: failureReason ? [failureReason] : [],
      status: normalizedStatus,
      statusExternal: attempt.status
    });
    await kycCase.update({
      failureReasons: failureReason ? [failureReason] : [],
      status: normalizedStatus,
      statusExternal: attempt.status,
      ...lifecycle
    });

    res.status(httpStatus.OK).json({
      ...(failureReason ? { failureReason } : {}),
      ...(attempt.result ? { result: attempt.result } : {}),
      status: attempt.status
    });
  } catch (error) {
    handleApiError(error, res, "getKybAttemptStatus");
  }
};
