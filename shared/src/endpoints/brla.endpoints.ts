import { EvmAddress } from '../types';

export namespace BrlaEndpoints {
  // GET /brla/getUser?taxId=:taxId
  export interface GetUserRequest {
    taxId: string;
  }

  export interface GetUserResponse {
    evmAddress: string;
  }

  // GET /brla/getOfframpStatus?taxId=:taxId
  export interface GetOfframpStatusRequest {
    taxId: string;
  }

  export interface GetOfframpStatusResponse {
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
  }

  // GET /brla/validatePixKey?pixKey=:pixKey
  export interface ValidatePixKeyRequest {
    pixKey: string;
  }

  export interface ValidatePixKeyResponse {
    valid: boolean;
  }

  // GET /brla/payIn?taxId=:taxId&amount=:amount&receiverAddress=:receiverAddress
  export interface GetPayInCodeRequest {
    taxId: string;
    amount: string;
    receiverAddress: string;
  }

  export interface GetPayInCodeResponse {
    brCode: string;
    [key: string]: any; // Additional fields from BRLA API
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
    startDate?: string;
    cnpj?: string;
  }

  export interface CreateSubaccountResponse {
    subaccountId: string;
  }

  // POST /brla/triggerPayIn
  export interface TriggerPayInRequest {
    taxId: string;
    amount: number;
    receiverAddress: string;
  }

  export interface TriggerPayInResponse {
    // Empty response with 200 status
  }

  export interface BrlaErrorResponse {
    error: string;
    details?: string;
  }
}
