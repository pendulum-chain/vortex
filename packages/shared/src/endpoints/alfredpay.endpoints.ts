import {
  AlfredPayStatus,
  AlfredpayCustomerType,
  AlfredpayFiatAccount,
  AlfredpayFiatAccountType,
  CreateAlfredpayCustomerResponse,
  GetKybRedirectLinkResponse,
  GetKycRedirectLinkResponse,
  GetKycStatusResponse
} from "../services/alfredpay/types";

// GET /alfredpay/alfredpayStatus?country=:country
export interface AlfredpayStatusRequest {
  country: string;
}

export interface AlfredpayStatusResponse {
  status: AlfredPayStatus;
  country: string;
  creationTime: string;
}

// POST /alfredpay/createIndividualCustomer
export interface AlfredpayCreateCustomerRequest {
  country: string;
}

export interface AlfredpayCreateCustomerResponse {
  createdAt: string;
}

// GET /alfredpay/getKycRedirectLink?country=:country
export interface AlfredpayGetKycRedirectLinkRequest {
  country: string;
  type?: AlfredpayCustomerType;
}

export type AlfredpayGetKycRedirectLinkResponse = GetKycRedirectLinkResponse;

export type AlfredpayGetKybRedirectLinkResponse = GetKybRedirectLinkResponse;

// POST /alfredpay/kycRedirectOpened
export interface AlfredpayKycRedirectOpenedRequest {
  country: string;
  type?: AlfredpayCustomerType;
}

export interface AlfredpayKycRedirectOpenedResponse {
  success: boolean;
}

// POST /alfredpay/kycRedirectFinished
export interface AlfredpayKycRedirectFinishedRequest {
  country: string;
  type?: AlfredpayCustomerType;
}

export interface AlfredpayKycRedirectFinishedResponse {
  success: boolean;
}

// GET /alfredpay/getKycStatus?country=:country&type=:type
export interface AlfredpayGetKycStatusRequest {
  country: string;
  type?: AlfredpayCustomerType;
}

export interface AlfredpayGetKycStatusResponse {
  status: AlfredPayStatus;
  lastFailure?: string;
  updated_at: string;
  alfred_pay_id: string;
  country: string;
}

export type AlfredpayGetKybStatusRequest = AlfredpayGetKycStatusRequest;
export type AlfredpayGetKybStatusResponse = AlfredpayGetKycStatusResponse;

export interface AlfredpayRetryKycRequest {
  country: string;
  type?: AlfredpayCustomerType;
}

export interface AlfredpayListFiatAccountsRequest {
  country: string;
}

export type AlfredpayListFiatAccountsResponse = AlfredpayFiatAccount[];

export interface AlfredpayAddFiatAccountRequest {
  country: string;
  type: AlfredpayFiatAccountType;
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
  documentType?: string;
  documentNumber?: string;
  isExternal?: boolean;
}

export interface AlfredpayAddFiatAccountResponse {
  fiatAccountId: string;
}

export interface AlfredpayDeleteFiatAccountRequest {
  country: string;
}

export interface AlfredpayFiatAccountRequirementsRequest {
  country: string;
  paymentMethod: string;
}

export interface AlfredpayFiatAccountRequirement {
  field: string;
  label: string;
  type: "text" | "select" | "phone" | "email";
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
}

export type AlfredpayFiatAccountRequirementsResponse = AlfredpayFiatAccountRequirement[];
