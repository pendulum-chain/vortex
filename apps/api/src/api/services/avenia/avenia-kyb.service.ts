import { AveniaDocument, AveniaDocumentType, BrlaApiService, KycAttemptStatus } from "@vortexfi/shared";
import httpStatus from "http-status";
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
  subAccountId: string
): Promise<void> {
  if (record.status === VerificationStatus.Approved) {
    throw new APIError({ message: "This company is already approved", status: httpStatus.CONFLICT });
  }
  const { attempts } = await brlaApiService.getKycAttempts(subAccountId);
  const hasOngoingKybAttempt = attempts.some(
    attempt =>
      attempt.levelName === "kyb-level-1" &&
      (attempt.status === KycAttemptStatus.PENDING || attempt.status === KycAttemptStatus.PROCESSING)
  );
  if (hasOngoingKybAttempt) {
    throw new APIError({
      message: "A KYB attempt is already in progress",
      status: httpStatus.CONFLICT
    });
  }
}

export const AVENIA_IDENTITY_DOCUMENT_TYPES = [
  AveniaDocumentType.ID,
  AveniaDocumentType.DRIVERS_LICENSE,
  AveniaDocumentType.PASSPORT,
  AveniaDocumentType.RESIDENCE_PERMIT
];
