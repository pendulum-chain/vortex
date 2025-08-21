import { AveniaDocumentType, AveniaIdentityStatus } from "src/services";
import { RampDirection } from "../types/rampDirection";

export enum KycFailureReason {
  FACE = "face",
  NAME = "name",
  UNKNOWN = "unknown"
}

// GET /brla/getUser?taxId=:taxId
export interface BrlaGetUserRequest {
  taxId: string;
}

export interface BrlaGetUserResponse {
  evmAddress: string;
  kycLevel: number;
  identityStatus: AveniaIdentityStatus;
}

// GET /brla/getRampStatus?taxId=:taxId
export interface BrlaGetRampStatusRequest {
  taxId: string;
}

export interface BrlaGetRampStatusResponse {
  type: string;
  status: string;
}

// GET /brla/getKycStatus?taxId=:taxId
export interface BrlaGetKycStatusRequest {
  taxId: string;
}

export interface BrlaGetKycStatusResponse {
  type: string;
  status: string;
  level: number;
  failureReason: KycFailureReason;
}

// GET /brla/validatePixKey?pixKey=:pixKey
export interface BrlaValidatePixKeyRequest {
  pixKey: string;
}

export interface BrlaValidatePixKeyResponse {
  valid: boolean;
}

export interface BrlaGetUserRemainingLimitRequest {
  taxId: string;
  direction: RampDirection;
}

export interface BrlaGetUserRemainingLimitResponse {
  remainingLimit: number;
}

// POST /brla/createSubaccount
export interface BrlaAddress {
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  district: string;
  complement?: string;
}

export type TaxIdType = "CPF" | "CNPJ";

export type AveniaAccountType = "INDIVIDUAL";

export interface BrlaCreateSubaccountRequest {
  accountType: AveniaAccountType;
  name: string;
}

export interface BrlaCreateSubaccountResponse {
  subAccountId: string;
}

export interface BrlaErrorResponse {
  error: string;
  details?: string;
}

export enum BrlaKYCDocType {
  RG = "RG",
  CNH = "CNH"
}

// POST /brla/startKYC2
export interface AveniaKYCDataUploadRequest {
  documentType: AveniaDocumentType;
  taxId: string;
  isDoubleSided?: boolean;
}

export interface AveniaKYCDataUpload {
  selfieUpload: {
    id: string;
    uploadURLFront: string;
  };
  idUpload: {
    id: string;
    uploadURLFront: string;
    uploadURLBack?: string;
  };
}
