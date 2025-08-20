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

// POST /brla/triggerOfframp
export interface BrlaTriggerOfframpRequest {
  taxId: string;
  pixKey: string;
  amount: string;
  receiverTaxId: string;
}

export interface BrlaTriggerOfframpResponse {
  offrampId: string;
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

export interface BrlaCreateSubaccountRequest {
  phone: string;
  taxIdType: TaxIdType;
  address: BrlaAddress;
  fullName: string;
  cpf: string;
  birthdate: number; // Timestamp
  companyName?: string;
  startDate?: number;
  cnpj?: string;
}

export interface BrlaCreateSubaccountResponse {
  subaccountId: string;
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
export interface StartKYC2Request {
  documentType: BrlaKYCDocType;
  taxId: string;
}

export interface AveniaKYCDataUpload {
  selfieUpload: { id: string; selfieUploadUrl: string };
  idUpload: { id: string; uploadURLFront: string; uploadURLBack: string };
}
