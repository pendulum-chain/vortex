import { EvmAddress } from '../types';

export enum KycFailureReason {
  FACE = 'face',
  NAME = 'name',
  UNKOWN = 'unknown',
}

export namespace BrlaEndpoints {
  // GET /brla/getUser?taxId=:taxId
  export interface GetUserRequest {
    taxId: string;
  }

  export interface GetUserResponse {
    evmAddress: string;
    kycLevel: number;
  }

  // GET /brla/getRampStatus?taxId=:taxId
  export interface GetRampStatusRequest {
    taxId: string;
  }

  export interface GetRampStatusResponse {
    type: string;
    status: string;
  }

  // GET /brla/getKycStatus?taxId=:taxId
  export interface GetKycStatusRequest {
    taxId: string;
  }

  export interface GetKycStatusResponse {
    type: string;
    status: string;
    failureReason: KycFailureReason;
    level: number
  }

  // GET /brla/validatePixKey?pixKey=:pixKey
  export interface ValidatePixKeyRequest {
    pixKey: string;
  }

  export interface ValidatePixKeyResponse {
    valid: boolean;
  }

  export interface GetUserRemainingLimitRequest {
    taxId: string;
  }

  export interface GetUserRemainingLimitResponse {
    remainingLimitOnramp: number;
    remainingLimitOfframp: number;
  }

  // POST /brla/triggerOfframp
  export interface TriggerOfframpRequest {
    taxId: string;
    pixKey: string;
    amount: string;
    receiverTaxId: string;
  }

  export interface TriggerOfframpResponse {
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

  export type TaxIdType = 'CPF' | 'CNPJ';

  export interface CreateSubaccountRequest {
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

  export interface CreateSubaccountResponse {
    subaccountId: string;
  }

  export interface BrlaErrorResponse {
    error: string;
    details?: string;
  }

  export enum KYCDocType {
    RG = 'RG',
    CNH = 'CNH',
  }

  // POST /brla/startKYC2
  export interface StartKYC2Request {
    documentType: KYCDocType,
    taxId: string,
  }

  export interface StartKYC2Response {
    uploadUrls: KYCDataUploadFileFiles
  }

  export interface KYCDataUploadFileFiles {
    selfieUploadUrl: string;
    RGFrontUploadUrl: string;
    RGBackUploadUrl: string;
    CNHUploadUrl: string;
  }
}
