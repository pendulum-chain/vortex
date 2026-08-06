import crypto from "node:crypto";
import {
  AveniaDocument,
  AveniaDocumentType,
  AveniaKybLevel1Payload,
  BrlaApiService,
  KycAttemptResult,
  KycAttemptStatus
} from "@vortexfi/shared";
import httpStatus from "http-status";
import sequelize from "../../../config/database";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { APIError } from "../../errors/api-error";
import { findCustomerEntityIdsForProfile } from "../customer-entity.service";
import { findAveniaCustomerBySubaccountId } from "./avenia-customer.service";

export async function resolveOwnedAveniaBusinessAccount(
  profileId: string,
  subAccountId: string | undefined
): Promise<ProviderCustomer> {
  if (!subAccountId) {
    throw new APIError({ message: "Missing subAccountId", status: httpStatus.BAD_REQUEST });
  }

  const record = await findAveniaCustomerBySubaccountId(subAccountId);
  if (!record) {
    throw new APIError({ message: "Subaccount not found", status: httpStatus.NOT_FOUND });
  }
  const ownedEntityIds = await findCustomerEntityIdsForProfile(profileId);
  if (!ownedEntityIds.includes(record.customerEntityId)) {
    throw new APIError({ message: "This subaccount is not linked to your user profile.", status: httpStatus.FORBIDDEN });
  }
  if (record.customerType !== "business") {
    throw new APIError({ message: "KYB Level 1 is only available for COMPANY accounts.", status: httpStatus.BAD_REQUEST });
  }
  return record;
}

export async function getOrCreateAveniaKybCase(record: ProviderCustomer): Promise<KycCase> {
  const [kycCase] = await KycCase.findOrCreate({
    defaults: {
      customerEntityId: record.customerEntityId,
      level: "level_1",
      provider: "avenia",
      status: record.status,
      statusExternal: record.statusExternal,
      type: "kyb"
    },
    where: { providerCustomerId: record.id }
  });
  return kycCase;
}

export async function requireReadyAveniaDocument(
  brlaApiService: BrlaApiService,
  subAccountId: string,
  documentId: string,
  allowedTypes: AveniaDocumentType[]
): Promise<AveniaDocument> {
  const { document } = await brlaApiService.getUploadedDocument(documentId, subAccountId);
  if (document.id !== documentId) {
    throw new APIError({ message: "Avenia returned a mismatched document", status: httpStatus.BAD_GATEWAY });
  }
  if (!allowedTypes.includes(document.documentType)) {
    throw new APIError({ message: "Document type does not match this KYB field", status: httpStatus.BAD_REQUEST });
  }
  if (!document.ready) {
    throw new APIError({ message: "Document is not ready", status: httpStatus.CONFLICT });
  }
  return document;
}

export async function assertAveniaKybCanSubmit(
  brlaApiService: BrlaApiService,
  record: ProviderCustomer,
  kycCase: KycCase,
  subAccountId: string
): Promise<void> {
  if (record.status === VerificationStatus.Approved) {
    throw new APIError({ message: "This company is already approved", status: httpStatus.CONFLICT });
  }
  if (kycCase.submissionStatus === "submitting") {
    throw new APIError({ message: "A KYB submission is already in progress", status: httpStatus.CONFLICT });
  }
  if (kycCase.submissionStatus === "unknown") {
    throw new APIError({
      message: "The previous KYB submission outcome is unknown and must be reconciled before retrying",
      status: httpStatus.CONFLICT
    });
  }
  if (!kycCase.providerCaseId) {
    return;
  }

  const { attempt } = await brlaApiService.getKybAttemptStatus(kycCase.providerCaseId, subAccountId);
  if (attempt.id !== kycCase.providerCaseId) {
    throw new APIError({ message: "Avenia returned a mismatched KYB attempt", status: httpStatus.BAD_GATEWAY });
  }
  const retryableRejection =
    attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED && attempt.retryable;
  if (!retryableRejection) {
    throw new APIError({
      message:
        attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED
          ? "This KYB rejection is not retryable"
          : "A KYB attempt is already in progress or has been approved",
      status: httpStatus.CONFLICT
    });
  }
}

export function hashAveniaKybSubmission(payload: AveniaKybLevel1Payload | Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export async function reconcileAveniaKybSubmission(
  brlaApiService: BrlaApiService,
  record: ProviderCustomer,
  kycCase: KycCase,
  subAccountId: string,
  requestHash: string
): Promise<string | null> {
  if (kycCase.submissionStatus !== "submitting" && kycCase.submissionStatus !== "unknown") {
    return null;
  }
  if (kycCase.submissionRequestHash && kycCase.submissionRequestHash !== requestHash) {
    throw new APIError({
      message: "The previous KYB submission used different input and must be reconciled first",
      status: httpStatus.CONFLICT
    });
  }
  if (!kycCase.submissionStartedAt) {
    throw new APIError({ message: "The previous KYB submission must be reconciled first", status: httpStatus.CONFLICT });
  }

  const { attempts } = await brlaApiService.getKycAttempts(subAccountId);
  const startedAt = kycCase.submissionStartedAt.getTime();
  const matchingAttempts = attempts.filter(
    attempt => attempt.levelName === "kyb-level-1" && new Date(attempt.createdAt).getTime() >= startedAt
  );
  if (matchingAttempts.length > 1) {
    throw new APIError({ message: "Multiple KYB attempts require manual reconciliation", status: httpStatus.CONFLICT });
  }
  if (matchingAttempts.length === 1) {
    const attemptId = matchingAttempts[0].id;
    await sequelize.transaction(async transaction => {
      await record.update(
        { lastFailureReasons: [], status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING },
        { transaction }
      );
      await kycCase.update(
        {
          failureReasons: [],
          providerCaseId: attemptId,
          status: VerificationStatus.Pending,
          statusExternal: KycAttemptStatus.PENDING,
          submissionStatus: "submitted",
          submittedAt: kycCase.submissionStartedAt
        },
        { transaction }
      );
    });
    kycCase.set({
      providerCaseId: attemptId,
      statusExternal: KycAttemptStatus.PENDING,
      submissionStatus: "submitted"
    });
    return attemptId;
  }

  throw new APIError({
    message: "No matching KYB attempt was found; manual reconciliation is required before retrying",
    status: httpStatus.CONFLICT
  });
}

export async function claimAveniaKybSubmission(kycCase: KycCase, requestHash: string): Promise<void> {
  const [claimed] = await KycCase.update(
    { submissionRequestHash: requestHash, submissionStartedAt: new Date(), submissionStatus: "submitting" },
    {
      where: {
        id: kycCase.id,
        providerCaseId: kycCase.providerCaseId,
        submissionStatus: kycCase.submissionStatus
      }
    }
  );
  if (claimed !== 1) {
    throw new APIError({ message: "A KYB submission is already in progress", status: httpStatus.CONFLICT });
  }
}

export const AVENIA_IDENTITY_DOCUMENT_TYPES = [
  AveniaDocumentType.ID,
  AveniaDocumentType.DRIVERS_LICENSE,
  AveniaDocumentType.PASSPORT,
  AveniaDocumentType.RESIDENCE_PERMIT
];
