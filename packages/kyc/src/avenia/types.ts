import type { BrlaGetKycStatusResponse, KycFailureReason } from "@vortexfi/shared";

export enum KycStatus {
  PENDING = "PENDING",
  REJECTED = "REJECTED",
  APPROVED = "APPROVED"
}

export enum AveniaKycMachineErrorType {
  UserCancelled = "USER_CANCELLED",
  UnknownError = "UNKNOWN_ERROR"
}

export class AveniaKycMachineError extends Error {
  type: AveniaKycMachineErrorType;

  constructor(message: string, type: AveniaKycMachineErrorType) {
    super(message);
    this.type = type;
  }
}

export class KycSubmissionRejectedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "KycSubmissionRejectedError";
  }
}

export type AveniaKycFormData = {
  taxId: string;
  pixId: string;
  fullName: string;
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  birthdate: string;
  email: string;
  companyName?: string;
  startDate?: Date;
  partnerCpf?: string;
};

export type AveniaKybFormData = Pick<AveniaKycFormData, "fullName" | "taxId">;

export type UploadIds = {
  uploadedSelfieId: string;
  uploadedDocumentId: string;
  livenessUrl: string;
};

export interface AveniaKycContext {
  taxId: string;
  /**
   * Set by callers that already hold the account's tax id and name (an Avenia subaccount exists,
   * e.g. a pending company KYB being resumed): skips FormFilling and goes straight to
   * SubaccountSetup, which reuses the existing subaccount. Requires taxId and kycFormData.
   */
  resumeExistingAccount?: boolean;
  quoteId?: string;
  externalSessionId?: string;
  kybLink?: unknown;
  executionInput?: {
    taxId?: string;
  };
  subAccountId?: string;
  kycFormData?: AveniaKycFormData;
  livenessCheckOpened?: boolean;
  kycStatus?: KycStatus;
  rejectReason?: KycFailureReason | string;
  documentUploadIds?: UploadIds;
  error?: AveniaKycMachineError;
  isCompany?: boolean;
  kybAttemptId?: string;
  kybUrls?: {
    authorizedRepresentativeUrl: string;
    basicCompanyDataUrl: string;
  };
  kybStep?: "company" | "representative" | "verification";
  companyVerificationStarted?: boolean;
  representativeVerificationStarted?: boolean;
  maybeKycAttemptStatus?: BrlaGetKycStatusResponse;
}

export type AveniaKycOutput = AveniaKycContext;

export type VerifyStatusActorOutput = { type: "APPROVED" } | { type: "REJECTED"; reason: KycFailureReason | string };
