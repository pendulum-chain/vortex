import {
  AlfredPayStatus,
  CreateAlfredpayCustomerResponse,
  DomesticCustomerType,
  DomesticFiatAccount,
  DomesticFiatAccountType,
  GetKybRedirectLinkResponse,
  GetKycRedirectLinkResponse,
  GetKycStatusResponse
} from "../services/alfredpay/types";

// GET /alfredpay/alfredpayStatus?country=:country
export interface DomesticStatusRequest {
  country: string;
  type?: DomesticCustomerType;
}

export interface DomesticStatusResponse {
  status: AlfredPayStatus;
  country: string;
  creationTime: string;
}

// POST /alfredpay/createIndividualCustomer
export interface DomesticCreateCustomerRequest {
  country: string;
}

export interface DomesticCreateCustomerResponse {
  createdAt: string;
}

// GET /alfredpay/getKycRedirectLink?country=:country
export interface DomesticGetKycRedirectLinkRequest {
  country: string;
}

export type DomesticGetKycRedirectLinkResponse = GetKycRedirectLinkResponse;

export type DomesticGetKybRedirectLinkResponse = GetKybRedirectLinkResponse;

// POST /alfredpay/kycRedirectOpened
export interface DomesticKycRedirectOpenedRequest {
  country: string;
  type?: DomesticCustomerType;
}

export interface DomesticKycRedirectOpenedResponse {
  success: boolean;
}

// POST /alfredpay/kycRedirectFinished
export interface DomesticKycRedirectFinishedRequest {
  country: string;
  type?: DomesticCustomerType;
}

export interface DomesticKycRedirectFinishedResponse {
  success: boolean;
}

// GET /alfredpay/getKycStatus?country=:country&type=:type
export interface DomesticGetKycStatusRequest {
  country: string;
  type?: DomesticCustomerType;
}

export interface DomesticGetKycStatusResponse {
  status: AlfredPayStatus;
  lastFailure?: string;
  updated_at: string;
  alfred_pay_id: string;
  country: string;
}

export type DomesticGetKybStatusRequest = DomesticGetKycStatusRequest;
export type DomesticGetKybStatusResponse = DomesticGetKycStatusResponse;

export interface DomesticRetryKycRequest {
  country: string;
  type?: DomesticCustomerType;
}

export interface DomesticListFiatAccountsRequest {
  country: string;
}

export type DomesticListFiatAccountsResponse = DomesticFiatAccount[];

export interface DomesticAddFiatAccountRequest {
  country: string;
  type: DomesticFiatAccountType;
  accountNumber: string;
  accountType?: string;
  accountName?: string;
  accountBankCode?: string;
  routingNumber?: string;
  bankStreet?: string;
  bankCity?: string;
  bankState?: string;
  bankCountry?: string;
  bankPostalCode?: string;
  beneficiaryStreet?: string;
  beneficiaryCity?: string;
  beneficiaryState?: string;
  beneficiaryCountry?: string;
  beneficiaryPostalCode?: string;
  documentType?: string;
  documentNumber?: string;
  isExternal?: boolean;
}

export interface DomesticAddFiatAccountResponse {
  fiatAccountId: string;
}

export interface DomesticDeleteFiatAccountRequest {
  country: string;
}

export interface DomesticFiatAccountRequirementsRequest {
  country: string;
  paymentMethod: string;
}

export interface DomesticFiatAccountRequirement {
  field: string;
  label: string;
  type: "text" | "select" | "phone" | "email";
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
}

export type DomesticFiatAccountRequirementsResponse = DomesticFiatAccountRequirement[];
