import {
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
  BrlaValidatePixKeyRequest,
  BrlaValidatePixKeyResponse,
  KybAttemptStatusResponse,
  KybLevel1Response,
  KycAttemptResult,
  KycAttemptStatus,
  KycFailureReason,
  KycLevel1Payload,
  KycLevel1Response,
  RampDirection
} from "@packages/shared";
import { AveniaAccountType, isValidCnpj } from "@packages/shared/src/services";
import { Request, Response } from "express";
import httpStatus from "http-status";
import TaxId from "../../models/taxId.model";
import { APIError } from "../errors/api-error";

// map from subaccountId → last interaction timestamp. Used for fetching the last relevant kyc event.
const lastInteractionMap = new Map<string, number>();

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
  console.error(`Error while performing ${apiMethod}: `, error);

  if (error instanceof Error && error.message.includes("status '400'")) {
    const splitError = error.message.split("Error: ", 1);
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
 * @throws 400 - If taxId or pixId are missing or if KYC level is invalid
 * @throws 404 - If the subaccount cannot be found
 * @throws 500 - For any server-side errors during processing
 */
export const getAveniaUser = async (
  req: Request<unknown, unknown, unknown, BrlaGetUserRequest>,
  res: Response<BrlaGetUserResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId query parameters" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    const accountInfo = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
    if (!accountInfo) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount info not found" });
      return;
    }

    const kycLevel = accountInfo.accountInfo.identityStatus === "CONFIRMED" ? 1 : 0;
    res.json({
      evmAddress: accountInfo.wallets.find(w => w.chain === "EVM")?.walletAddress ?? "",
      identityStatus: accountInfo.accountInfo.identityStatus,
      kycLevel,
      subAccountId: taxIdRecord.subAccountId
    });
    return;
  } catch (error) {
    console.log(error);
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

export const getAveniaUserRemainingLimit = async (
  req: Request<unknown, unknown, unknown, BrlaGetUserRemainingLimitRequest>,
  res: Response<BrlaGetUserRemainingLimitResponse | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { taxId, direction } = req.query;

    if (!taxId || !direction) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing taxId or direction query parameter" });
      return;
    }

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      throw new APIError({
        message: "Ramp disabled",
        status: httpStatus.BAD_REQUEST
      });
    }

    const brlaApiService = BrlaApiService.getInstance();
    if (!taxIdRecord) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }
    const limitsData = await brlaApiService.getSubaccountUsedLimit(taxIdRecord.subAccountId);

    if (!limitsData || !limitsData.limitInfo || !limitsData.limitInfo.limits) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Limits not found" });
      return;
    }

    const brlLimits = limitsData.limitInfo.limits.find(limit => limit.currency === BrlaCurrency.BRL);

    if (!brlLimits) {
      // Our current assumption is that BRL limits won't exist for an account without a KYC.
      // But to be safe, we check the status and return a proper status.
      const accountInfo = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
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
  res: Response<BrlaCreateSubaccountResponse>
): Promise<void> => {
  try {
    const { name, taxId, accountType: requestAccountType } = req.body;

    const isCnpj = isValidCnpj(taxId);

    // Use the accountType from the request if provided, otherwise determine from taxId
    const accountType = requestAccountType || (isCnpj ? AveniaAccountType.COMPANY : AveniaAccountType.INDIVIDUAL);

    const brlaApiService = BrlaApiService.getInstance();
    const { id } = await brlaApiService.createAveniaSubaccount(accountType, name);

    await TaxId.create({
      accountType,
      subAccountId: id,
      taxId: taxId
    });

    res.status(httpStatus.OK).json({ subAccountId: id });
  } catch (error) {
    console.error("Error creating subaccount:", error);
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

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const kycAttemptStatuses = await brlaApiService.getKycAttempts(taxIdRecord.subAccountId);
    const kycAttemptStatus = kycAttemptStatuses.attempts[0]; // Get the latest attempt
    if (!kycAttemptStatus) {
      const accountInfo = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
      if (accountInfo?.accountInfo.identityStatus === "CONFIRMED") {
        res.status(httpStatus.OK).json({
          level: "KYC_1",
          result: KycAttemptResult.APPROVED,
          status: KycAttemptStatus.COMPLETED,
          type: "KYC"
        });
        return;
      }
      res.status(httpStatus.NOT_FOUND).json({ error: "KYC attempt not found" });
      return;
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

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Ramp disabled" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();

    const selfieUrl = await brlaApiService.getDocumentUploadUrls(
      AveniaDocumentType.SELFIE_FROM_LIVENESS,
      false,
      taxIdRecord.subAccountId
    );

    res.status(httpStatus.OK).json({
      id: selfieUrl.id,
      livenessUrl: selfieUrl.livenessUrl ?? "",
      uploadURLFront: selfieUrl.uploadURLFront,
      validateLivenessToken: selfieUrl.validateLivenessToken ?? ""
    });
  } catch (error) {
    console.error(error);
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

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      // Invalid state. Cannot happen since we create the subaccount first for every tax.
      res.status(httpStatus.BAD_REQUEST).json({ error: "Ramp disabled" });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();

    const selfieUrl = await brlaApiService.getDocumentUploadUrls(
      AveniaDocumentType.SELFIE_FROM_LIVENESS,
      false,
      taxIdRecord.subAccountId
    );

    // assume RG is double sided, CNH is not.
    const isDoubleSided = documentType === AveniaDocumentType.ID ? true : false;

    const idUrls = await brlaApiService.getDocumentUploadUrls(documentType, isDoubleSided, taxIdRecord.subAccountId);

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
    console.error(error);
    handleApiError(error, res, "getUploadUrls");
  }
};

export const newKyc = async (
  req: Request<unknown, unknown, KycLevel1Payload>,
  res: Response<KycLevel1Response | BrlaErrorResponse>
): Promise<void> => {
  try {
    const brlaApiService = BrlaApiService.getInstance();
    await new Promise(resolve => setTimeout(resolve, 5000));
    const subAccountId = req.body.subAccountId;
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
  req: Request<unknown, unknown, unknown, { subAccountId?: string }>,
  res: Response<KybLevel1Response | BrlaErrorResponse>
): Promise<void> => {
  try {
    const { subAccountId } = req.query;

    if (!subAccountId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Missing subAccountId" });
      return;
    }

    const taxIdRecord = await TaxId.findOne({ where: { subAccountId } });
    if (!taxIdRecord) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Subaccount not found" });
      return;
    }

    if (taxIdRecord.accountType !== AveniaAccountType.COMPANY) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "KYB Level 1 is only available for COMPANY accounts. This account is registered as " + taxIdRecord.accountType
      });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const response = await brlaApiService.initiateKybLevel1(subAccountId);

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

    const brlaApiService = BrlaApiService.getInstance();
    const response = await brlaApiService.getKybAttemptStatus(attemptId);

    res.status(httpStatus.OK).json(response);
  } catch (error) {
    handleApiError(error, res, "getKybAttemptStatus");
  }
};
