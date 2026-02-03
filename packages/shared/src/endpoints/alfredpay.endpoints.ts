import {
  AlfredPayStatus,
  AlfredpayCustomerType,
  CreateAlfredpayCustomerResponse,
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
}

export type AlfredpayGetKycRedirectLinkResponse = GetKycRedirectLinkResponse;

// POST /alfredpay/kycRedirectOpened
export interface AlfredpayKycRedirectOpenedRequest {
  country: string;
}

export interface AlfredpayKycRedirectOpenedResponse {
  success: boolean;
}

// POST /alfredpay/kycRedirectFinished
export interface AlfredpayKycRedirectFinishedRequest {
  country: string;
}

export interface AlfredpayKycRedirectFinishedResponse {
  success: boolean;
}

// GET /alfredpay/getKycStatus?country=:country
export interface AlfredpayGetKycStatusRequest {
  country: string;
}

export interface AlfredpayGetKycStatusResponse {
  status: AlfredPayStatus;
  lastFailure?: string;
  updated_at: string;
  email: string;
  alfred_pay_id: string;
  country: string;
}
