import {
  AveniaDocument,
  AveniaDocumentType,
  AveniaUboPayload,
  AveniaUboResponse,
  BRLA_PRIVATE_KEY,
  BrlaApiError,
  BrlaApiService,
  KycAttemptStatus
} from "@vortexfi/shared";
import crypto from "crypto";
import httpStatus from "http-status";
import sequelize from "../../../config/database";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { APIError } from "../../errors/api-error";
import { findCustomerEntityIdsForProfile } from "../customer-entity.service";
import { findAveniaCustomerBySubaccountId } from "./avenia-customer.service";

const kybCaseCreations = new Map<string, Promise<KycCase>>();

function hashUboValue(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, canonicalize(nested)])
      );
    }
    return input;
  };
  return crypto
    .createHmac("sha256", BRLA_PRIVATE_KEY)
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function uboSubmissionKey(subAccountId: string, payload: AveniaUboPayload): string {
  return hashUboValue([subAccountId, payload.countryOfTaxId, payload.taxIdNumber]);
}

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
  const inFlight = kybCaseCreations.get(record.id);
  if (inFlight) return inFlight;

  const creation = KycCase.findOrCreate({
    defaults: {
      customerEntityId: record.customerEntityId,
      level: "level_1",
      provider: "avenia",
      status: record.status,
      statusExternal: record.statusExternal,
      type: "kyb"
    },
    where: { providerCustomerId: record.id }
  }).then(([kycCase]) => kycCase);
  kybCaseCreations.set(record.id, creation);
  try {
    return await creation;
  } finally {
    kybCaseCreations.delete(record.id);
  }
}

export async function createAveniaUboOnce(
  brlaApiService: BrlaApiService,
  record: ProviderCustomer,
  payload: AveniaUboPayload,
  subAccountId: string
): Promise<AveniaUboResponse> {
  const key = uboSubmissionKey(subAccountId, payload);
  const payloadFingerprint = hashUboValue(payload);
  let kycCaseId: string | undefined;
  const existing = await sequelize.transaction(async transaction => {
    const lockedRecord = await ProviderCustomer.findByPk(record.id, { lock: transaction.LOCK.UPDATE, transaction });
    if (!lockedRecord) throw new Error("Avenia customer disappeared during UBO creation");
    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { providerCustomerId: record.id }
    });
    if (cases.length > 1) {
      throw new APIError({ message: "Multiple KYB cases require reconciliation", status: httpStatus.CONFLICT });
    }
    const lockedCase =
      cases[0] ??
      (await KycCase.create(
        {
          customerEntityId: record.customerEntityId,
          level: "level_1",
          provider: "avenia",
          providerCustomerId: record.id,
          status: record.status,
          statusExternal: record.statusExternal,
          type: "kyb"
        },
        { transaction }
      ));
    kycCaseId = lockedCase.id;
    const submission = lockedCase.uboSubmissions[key];
    if (submission?.status === "confirmed" && submission.providerUboId) {
      if (submission.payloadFingerprint !== payloadFingerprint) {
        throw new APIError({ message: "This UBO already exists with different details", status: httpStatus.CONFLICT });
      }
      return { id: submission.providerUboId };
    }
    if (submission?.status === "prepared" || submission?.status === "ambiguous") {
      throw new APIError({
        message: "The previous UBO submission outcome requires reconciliation",
        status: httpStatus.CONFLICT
      });
    }
    await lockedCase.update(
      {
        uboSubmissions: {
          ...lockedCase.uboSubmissions,
          [key]: {
            attemptedAt: new Date().toISOString(),
            payloadFingerprint,
            status: "prepared"
          }
        }
      },
      { transaction }
    );
    return null;
  });
  if (existing) return existing;
  if (!kycCaseId) throw new Error("KYB case was not selected during UBO creation");

  try {
    const response = await brlaApiService.createUbo(payload, subAccountId);
    await updateUboSubmission(kycCaseId, key, {
      confirmedAt: new Date().toISOString(),
      providerUboId: response.id,
      status: "confirmed"
    });
    return response;
  } catch (error) {
    const deterministicFailure =
      error instanceof BrlaApiError && error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
    await updateUboSubmission(kycCaseId, key, {
      ...(error instanceof BrlaApiError ? { httpStatus: error.status } : {}),
      status: deterministicFailure ? "failed" : "ambiguous"
    });
    throw error;
  }
}

async function updateUboSubmission(
  kycCaseId: string,
  key: string,
  update: Partial<KycCase["uboSubmissions"][string]>
): Promise<void> {
  await sequelize.transaction(async transaction => {
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!kycCase) throw new Error("KYB case disappeared during UBO creation");
    const submission = kycCase.uboSubmissions[key];
    if (!submission) throw new Error("KYB UBO submission state disappeared");
    await kycCase.update(
      { uboSubmissions: { ...kycCase.uboSubmissions, [key]: { ...submission, ...update } } },
      { transaction }
    );
  });
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
