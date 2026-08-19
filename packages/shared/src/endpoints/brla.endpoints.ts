import {
  AveniaAccountType,
  AveniaIdentityStatus,
  BrDocumentType,
  KycAttemptResult,
  KycAttemptStatus
} from "../services/brla/types";
import { RampDirection } from "../types/rampDirection";

export enum KycFailureReason {
  FACE = "face",
  NAME = "name",
  BIRTHDATE = "birthdate",
  UNKNOWN = "unknown",
  TAX_ID = "tax_id"
}

// GET /brla/getUser?taxId=:taxId
export interface BrGetUserRequest {
  taxId?: string;
}

export interface BrPostRecordInitialKycAttemptRequest extends BrGetUserRequest {
  quoteId: string;
  sessionId?: string;
  taxId: string;
}
export interface BrGetUserResponse {
  evmAddress: string;
  kycLevel: number;
  identityStatus: AveniaIdentityStatus;
  subAccountId: string;
}

// GET /brla/getRampStatus?taxId=:taxId
export interface BrGetRampStatusRequest {
  taxId: string;
}

export interface BrGetRampStatusResponse {
  type: string;
  status: string;
}

// GET /brla/getKycStatus?taxId=:taxId
export interface BrGetKycStatusRequest {
  taxId: string;
}

export interface BrGetSelfieLivenessUrlRequest {
  taxId: string;
}

export interface BrGetKycStatusResponse {
  type: "KYC";
  level: string;
  status: KycAttemptStatus;
  result?: KycAttemptResult;
  failureReason?: KycFailureReason;
}

export interface BrGetSelfieLivenessUrlResponse {
  id: string;
  livenessUrl: string;
  uploadURLFront: string;
  validateLivenessToken: string;
}

// GET /brla/validatePixKey?pixKey=:pixKey
export interface BrValidatePixKeyRequest {
  pixKey: string;
}

export interface BrValidatePixKeyResponse {
  valid: boolean;
}

export interface BrGetUserRemainingLimitRequest {
  taxId?: string;
  direction: RampDirection;
}

export interface BrGetUserRemainingLimitResponse {
  remainingLimit: number;
}

// POST /brla/createSubaccount
export interface BrAddress {
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  district: string;
  complement?: string;
}

export type TaxIdType = "CPF" | "CNPJ";

export interface BrCreateSubaccountRequest {
  accountType: AveniaAccountType;
  name: string;
  taxId: string;
  // Optional: quote-less onboarding paths can create a subaccount without a quote.
  quoteId?: string;
  sessionId?: string;
}

export interface BrCreateSubaccountResponse {
  subAccountId: string;
}

// POST /brla/kyc/import-token
export interface BrImportKycTokenRequest {
  importToken: string;
  consentAttested: true;
}

export interface BrImportKycTokenResponse {
  attemptId: string;
  status: "pending";
}

export interface BrErrorResponse {
  error: string;
  details?: string;
}

export enum BrKYCDocType {
  RG = "RG",
  CNH = "CNH"
}

// POST /brla/startKYC2
export interface BrKYCDataUploadRequest {
  documentType: BrDocumentType;
  isDoubleSided?: boolean;
  taxId: string;
}

export interface BrKYCDataUpload {
  selfieUpload: {
    id: string;
    uploadURLFront: string;
    livenessUrl?: string;
    validateLivenessToken?: string;
  };
  idUpload: {
    id: string;
    uploadURLFront: string;
    uploadURLBack?: string;
  };
}
