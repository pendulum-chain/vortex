import {
  AlfredPayStatus,
  AlfredpayCustomerType,
  AlfredpayFiatAccount,
  AlfredpayFiatAccountRequirement,
  AlfredpayFiatAccountType,
  GetKycRedirectLinkResponse
} from "../services/alfredpay/types";

export interface AlfredpayStatusRequest {
  country: string;
  email: string;
}

export interface AlfredpayStatusResponse {
  status: AlfredPayStatus;
  country: string;
  creationTime: string;
}

export interface AlfredpayCreateCustomerRequest {
  country: string;
  type: AlfredpayCustomerType;
}

export interface AlfredpayCreateCustomerResponse {
  createdAt: string;
}

export interface AlfredpayGetKycRedirectLinkRequest {
  country: string;
}

export type AlfredpayGetKycRedirectLinkResponse = GetKycRedirectLinkResponse;

export interface AlfredpayKycRedirectOpenedRequest {
  country: string;
}

export interface AlfredpayKycRedirectOpenedResponse {
  success: boolean;
}
export interface AlfredpayKycRedirectFinishedRequest {
  country: string;
}

export interface AlfredpayKycRedirectFinishedResponse {
  success: boolean;
}
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

export interface AlfredpayListFiatAccountsRequest {
  country: string;
}

export type AlfredpayListFiatAccountsResponse = AlfredpayFiatAccount[];

export interface AlfredpayAddFiatAccountRequest {
  country: string;
  type: AlfredpayFiatAccountType;
  accountNumber: string;
  accountType: string;
  accountName: string;
  accountBankCode: string;
  accountAlias?: string;
  networkIdentifier?: string;
  routingNumber?: string;
  bankStreet?: string;
  bankCity?: string;
  bankState?: string;
  bankCountry?: string;
  bankPostalCode?: string;
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

export type AlfredpayFiatAccountRequirementsResponse = AlfredpayFiatAccountRequirement[];
