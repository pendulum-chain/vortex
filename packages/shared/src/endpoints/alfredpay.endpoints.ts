import {
  AlfredPayStatus,
  AlfredpayCustomerType,
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

// POST /alfredpay/createCustomer
export interface AlfredpayCreateCustomerRequest {
  country: string;
  type: AlfredpayCustomerType;
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
  email: string;
  alfred_pay_id: string;
  country: string;
}

export type AlfredpayGetKybStatusRequest = AlfredpayGetKycStatusRequest;
export type AlfredpayGetKybStatusResponse = AlfredpayGetKycStatusResponse;

export interface AlfredpayRetryKycRequest {
  country: string;
  type?: AlfredpayCustomerType;
}
